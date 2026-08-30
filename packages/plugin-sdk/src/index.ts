/** Plugin manifest stored in `{appDir}/plugins/{id}/manifest.json` */
export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly author?: string;
  readonly main?: string;
  readonly manifestUrl?: string;
  readonly minAppVersion?: string;
}

export interface PluginExports {
  onLoad?: (api: PluginApi) => void | Promise<void>;
  onUnload?: (api: PluginApi) => void | Promise<void>;
}

export interface Hotkey {
  readonly modifiers: ReadonlyArray<"Mod" | "Ctrl" | "Cmd" | "Alt" | "Shift">;
  readonly key: string;
}

export interface Command {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  readonly hotkeys?: ReadonlyArray<Hotkey>;
  readonly checkCallback?: (checking: boolean) => boolean;
  readonly callback: () => void | Promise<void>;
  readonly hidden?: boolean;
}

export interface CommandRegistry {
  register(command: Command): () => void;
  unregister(id: string): void;
  get(id: string): Command | undefined;
  list(): ReadonlyArray<Command>;
  run(id: string): Promise<void>;
}

export interface VaultInfo {
  readonly id: string;
  readonly name: string;
  readonly kind: "tauri" | "remote";
}

export interface VaultApi {
  readonly active: VaultInfo;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  listMarkdown(): Promise<ReadonlyArray<{ path: string; size: number; mtimeMs: number }>>;
  listAttachments(): Promise<ReadonlyArray<{ path: string; size: number; mtimeMs: number }>>;
}

export interface WritingInventory {
  readonly markdownFiles: number;
  readonly excalidrawFiles: number;
  readonly imageFiles: number;
}

export interface WritingStatsSnapshot {
  readonly localDate: string;
  readonly todayInsertedUnits: number;
  readonly totalMarkdownUnits: number;
  readonly inventory: WritingInventory;
}

export interface WritingStatsApi {
  getSnapshot(): WritingStatsSnapshot;
}

export interface FileCache {
  path: string;
  frontmatter: Record<string, unknown>;
  headings: Array<{ level: number; text: string; line: number }>;
  links: Array<{ target: string; display?: string; line: number }>;
  embeds: Array<{ target: string; line: number }>;
  tags: string[];
}

export interface MetadataCacheApi {
  getFileCache(path: string): FileCache | null;
  getBacklinks(path: string): Array<{ source: string; lines: number[] }>;
  getAllTags(): Array<{ name: string; count: number }>;
}

export type PluginEventName =
  | "file-open"
  | "file-save"
  | "file-create"
  | "file-delete"
  | "active-leaf-change"
  | "layout-change"
  | "file-rename"
  | "writing-stats";

export interface PluginEventMap {
  "file-open": { path: string };
  "file-save": { path: string; content?: string };
  "file-create": { path: string };
  "file-delete": { path: string };
  "active-leaf-change": { path: string | null };
  "layout-change": Record<string, never>;
  "file-rename": { from: string; to: string };
  "writing-stats": WritingStatsSnapshot;
}

export interface PluginEventsApi {
  on<E extends PluginEventName>(
    event: E,
    listener: (data: PluginEventMap[E]) => void,
  ): () => void;
}

export interface PluginStatusBarItemHandle {
  setText(text: string): void;
  setTooltip(text: string | null): void;
  setOnClick(fn: (() => void) | null): void;
  remove(): void;
}

export interface PluginStatusBarApi {
  add(opts?: { text?: string; tooltip?: string; onClick?: () => void }): PluginStatusBarItemHandle;
}

export interface PluginSettingsTabSpec {
  readonly name: string;
  readonly render: (container: HTMLElement) => undefined | (() => void);
}

export type LeafMode = "live" | "source";

export interface WorkspaceApi {
  openFile(path: string, opts?: { newTab?: boolean; mode?: LeafMode }): void;
  openExcalidraw(path: string, opts?: { newTab?: boolean }): void;
  openImage(path: string, opts?: { newTab?: boolean }): void;
  openGraph(opts?: { newTab?: boolean }): void;
  openSettings(): void;
  getActivePath(): string | null;
}

export interface ChestnutApi {
  readonly version: string;
}

export interface PluginApi {
  readonly commands: CommandRegistry;
  readonly workspace: WorkspaceApi;
  readonly vault: VaultApi;
  readonly metadataCache: MetadataCacheApi;
  readonly events: PluginEventsApi;
  readonly statusBar: PluginStatusBarApi;
  readonly stats: WritingStatsApi;
  readonly chestnut: ChestnutApi;
  getResourceUrl(relPath: string): Promise<string>;
  loadData<T = unknown>(): Promise<T | null>;
  saveData(data: unknown): Promise<void>;
  addSettingsTab(spec: PluginSettingsTabSpec): () => void;
  log(...args: unknown[]): void;
}

export const APP_VERSION = "0.1.0";
