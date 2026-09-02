/** Must match SETTINGS_KEY in store.ts — this module must not import the app store. */
const SETTINGS_KEY = "chestnut-app-settings";
const LEGACY_SETTINGS_KEY = "boke-app-settings";
const CURRENT_LOG_KEY = "chestnut.startup-debug.current";
const PREVIOUS_LOG_KEY = "chestnut.startup-debug.previous";
const SESSION_BOOT_KEY = "chestnut.startup-debug.boot-id";

export type StartupLogLevel = "info" | "warn" | "error";

export interface StartupLogEntry {
  ms: number;
  at: string;
  step: string;
  detail?: string;
  level: StartupLogLevel;
}

export interface StartupLogSnapshot {
  bootId: string;
  startedAt: string;
  entries: StartupLogEntry[];
}

type Listener = () => void;

const startedAtMs = Date.now();
const startedAtIso = new Date(startedAtMs).toISOString();
const listeners = new Set<Listener>();
const entries: StartupLogEntry[] = [];
const hangWatches = new Map<string, ReturnType<typeof setInterval>>();

let bootId = "";
let installed = false;
let panelOpen = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export interface StartupDebugUiSnapshot {
  open: boolean;
  current: StartupLogSnapshot;
  previous: StartupLogSnapshot | null;
  vaultPath: string | null;
}

let uiSnapshot: StartupDebugUiSnapshot | null = null;

function notify(): void {
  uiSnapshot = null;
  for (const listener of listeners) listener();
}

/** Cached for useSyncExternalStore: consecutive calls must be referentially stable. */
export function getStartupDebugUiSnapshot(): StartupDebugUiSnapshot {
  if (!uiSnapshot) {
    uiSnapshot = {
      open: panelOpen,
      current: getStartupLogSnapshot(),
      previous: getPreviousStartupLog(),
      vaultPath: peekSavedVaultPath(),
    };
  }
  return uiSnapshot;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

function persistSoon(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const storage = safeStorage();
    if (!storage) return;
    try {
      storage.setItem(CURRENT_LOG_KEY, JSON.stringify(getStartupLogSnapshot()));
    } catch {
      // quota / private mode
    }
  }, 80);
}

export function getStartupLogSnapshot(): StartupLogSnapshot {
  return { bootId, startedAt: startedAtIso, entries: entries.slice() };
}

export function getPreviousStartupLog(): StartupLogSnapshot | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREVIOUS_LOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StartupLogSnapshot;
    if (!parsed?.bootId || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function formatStartupLogSnapshot(snapshot: StartupLogSnapshot): string {
  const lines = [
    `bootId=${snapshot.bootId}`,
    `startedAt=${snapshot.startedAt}`,
    "",
  ];
  for (const entry of snapshot.entries) {
    const detail = entry.detail ? `  ${entry.detail}` : "";
    lines.push(`[+${String(entry.ms).padStart(6, " ")}ms] ${entry.level.padEnd(5)} ${entry.step}${detail}`);
  }
  return lines.join("\n");
}

export function formatAllStartupLogs(): string {
  const current = formatStartupLogSnapshot(getStartupLogSnapshot());
  const previous = getPreviousStartupLog();
  if (!previous) return `=== current boot ===\n${current}`;
  return `=== previous boot ===\n${formatStartupLogSnapshot(previous)}\n\n=== current boot ===\n${current}`;
}

export function peekSavedVaultPath(): string | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(SETTINGS_KEY) ?? storage.getItem(LEGACY_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { localVaultPath?: unknown };
    return typeof parsed.localVaultPath === "string" && parsed.localVaultPath ? parsed.localVaultPath : null;
  } catch {
    return null;
  }
}

export function patchSavedVaultPath(path: string | null): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const raw = storage.getItem(SETTINGS_KEY) ?? storage.getItem(LEGACY_SETTINGS_KEY) ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (path) parsed.localVaultPath = path;
    else delete parsed.localVaultPath;
    storage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

export function logStartup(step: string, detail?: string, level: StartupLogLevel = "info"): void {
  const ms = Date.now() - startedAtMs;
  entries.push({
    ms,
    at: new Date().toISOString(),
    step,
    detail,
    level,
  });
  if (entries.length > 400) entries.splice(0, entries.length - 400);
  persistSoon();
  notify();
}

export function beginHangWatch(step: string, intervalMs = 2000): void {
  endHangWatch(step);
  const started = Date.now();
  hangWatches.set(
    step,
    setInterval(() => {
      const waited = Math.round((Date.now() - started) / 1000);
      logStartup(`${step}: still waiting`, `${waited}s`);
    }, intervalMs),
  );
}

export function endHangWatch(step: string): void {
  const timer = hangWatches.get(step);
  if (!timer) return;
  clearInterval(timer);
  hangWatches.delete(step);
}

export function subscribeStartupDebug(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isStartupDebugOpen(): boolean {
  return panelOpen;
}

export function openStartupDebugPanel(): void {
  panelOpen = true;
  notify();
}

export function closeStartupDebugPanel(): void {
  panelOpen = false;
  notify();
}

export function toggleStartupDebugPanel(): void {
  panelOpen = !panelOpen;
  notify();
}

function ingestInlineBootEvents(): void {
  const boot = (globalThis as { __CHESTNUT_BOOT__?: { t0?: number; events?: Array<{ ms?: number; step?: string }> } })
    .__CHESTNUT_BOOT__;
  if (!boot?.events) return;
  for (const event of boot.events) {
    if (!event.step) continue;
    entries.push({
      ms: typeof event.ms === "number" ? event.ms : 0,
      at: startedAtIso,
      step: event.step,
      level: "info",
    });
  }
}

export function installStartupDebug(): void {
  if (installed) return;
  installed = true;

  const session = safeSession();
  const storage = safeStorage();
  const existingBoot = session?.getItem(SESSION_BOOT_KEY);
  if (!existingBoot) {
    try {
      const last = storage?.getItem(CURRENT_LOG_KEY);
      if (last) storage?.setItem(PREVIOUS_LOG_KEY, last);
    } catch {
      // ignore
    }
    bootId = String(startedAtMs);
    session?.setItem(SESSION_BOOT_KEY, bootId);
  } else {
    bootId = existingBoot;
  }

  ingestInlineBootEvents();
  const savedPath = peekSavedVaultPath();
  logStartup("debug: installed", savedPath ? `savedVaultPath=${savedPath}` : "savedVaultPath=(default)");

  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    logStartup("window.error", event.message || String(event.error ?? "unknown"), "error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    logStartup("unhandledrejection", reason, "error");
  });

  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);
  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    logStartup("console.warn", args.map(stringifyArg).join(" "), "warn");
  };
  console.error = (...args: unknown[]) => {
    originalError(...args);
    logStartup("console.error", args.map(stringifyArg).join(" "), "error");
  };
}

function stringifyArg(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function copyStartupLogs(): Promise<boolean> {
  const text = formatAllStartupLogs();
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function reloadAfterVaultPathChange(): void {
  location.reload();
}
