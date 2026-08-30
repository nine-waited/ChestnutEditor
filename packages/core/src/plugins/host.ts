import type {
  PluginApi,
  PluginEventMap,
  PluginEventName,
  PluginExports,
  PluginManifest,
  PluginSettingsTabSpec,
  PluginStatusBarItemHandle,
} from "@chestnut/plugin-sdk";
import { APP_VERSION } from "@chestnut/plugin-sdk";

type PluginContext = {
  id: string;
  manifest: PluginManifest;
  module: PluginExports;
  disposers: Array<() => void>;
  settingsTabs: PluginSettingsTabSpec[];
  statusBarItems: PluginStatusBarItemHandle[];
};

export type PluginHostDeps = {
  buildApi: (pluginId: string) => PluginApi;
  readPluginModule: (pluginId: string, main: string) => Promise<PluginExports>;
  listInstalledPlugins: () => Promise<PluginManifest[]>;
  loadPluginData: (pluginId: string) => Promise<unknown | null>;
  savePluginData: (pluginId: string, data: unknown) => Promise<void>;
};

export class PluginHost {
  private loaded = new Map<string, PluginContext>();
  private enabled = new Set<string>();

  constructor(private deps: PluginHostDeps) {}

  async loadEnabled(): Promise<void> {
    const manifests = await this.deps.listInstalledPlugins();
    for (const manifest of manifests) {
      if (this.isEnabled(manifest.id)) {
        await this.enable(manifest.id, manifest);
      }
    }
  }

  isEnabled(id: string): boolean {
    return this.enabled.has(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    if (enabled) this.enabled.add(id);
    else this.enabled.delete(id);
  }

  getEnabledIds(): string[] {
    return [...this.enabled];
  }

  async enable(id: string, manifest?: PluginManifest): Promise<void> {
    if (this.loaded.has(id)) return;
    const manifests = manifest ? [manifest] : await this.deps.listInstalledPlugins();
    const m = manifests.find((p) => p.id === id);
    if (!m) throw new Error(`Plugin not found: ${id}`);
    const main = m.main ?? "main.js";
    const module = await this.deps.readPluginModule(id, main);
    const ctx: PluginContext = {
      id,
      manifest: m,
      module,
      disposers: [],
      settingsTabs: [],
      statusBarItems: [],
    };
    this.loaded.set(id, ctx);
    this.enabled.add(id);
    const api = this.wrapApi(id, this.deps.buildApi(id));
    await module.onLoad?.(api);
  }

  async disable(id: string): Promise<void> {
    const ctx = this.loaded.get(id);
    if (!ctx) return;
    const api = this.wrapApi(id, this.deps.buildApi(id));
    try {
      await ctx.module.onUnload?.(api);
    } finally {
      for (const d of ctx.disposers.reverse()) d();
      for (const item of ctx.statusBarItems) item.remove();
      this.loaded.delete(id);
      this.enabled.delete(id);
      ctx.disposers.length = 0;
      ctx.statusBarItems.length = 0;
      ctx.module = {};
    }
  }

  getLoadedManifests(): PluginManifest[] {
    return [...this.loaded.values()].map((c) => c.manifest);
  }

  listInstalled(): Promise<PluginManifest[]> {
    return this.deps.listInstalledPlugins();
  }

  loadData(pluginId: string): Promise<unknown | null> {
    return this.deps.loadPluginData(pluginId);
  }

  saveData(pluginId: string, data: unknown): Promise<void> {
    return this.deps.savePluginData(pluginId, data);
  }

  private wrapApi(pluginId: string, api: PluginApi): PluginApi {
    const host = this;
    return {
      ...api,
      addSettingsTab(spec: PluginSettingsTabSpec) {
        const ctx = host.loaded.get(pluginId);
        if (ctx) ctx.settingsTabs.push(spec);
        return api.addSettingsTab(spec);
      },
      statusBar: {
        add(opts) {
          const handle = api.statusBar.add(opts);
          const ctx = host.loaded.get(pluginId);
          if (ctx) ctx.statusBarItems.push(handle);
          return handle;
        },
      },
      log(...args: unknown[]) {
        console.log(`[plugin:${pluginId}]`, ...args);
      },
      chestnut: { version: APP_VERSION },
    };
  }
}

export class EventBus {
  private listeners = new Map<PluginEventName, Set<(data: never) => void>>();

  on<E extends PluginEventName>(event: E, listener: (data: PluginEventMap[E]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    const set = this.listeners.get(event)!;
    set.add(listener as (data: never) => void);
    return () => set.delete(listener as (data: never) => void);
  }

  emit<E extends PluginEventName>(event: E, data: PluginEventMap[E]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(data as never);
      } catch (err) {
        console.error(`[Chestnut] event listener "${event}" threw:`, err);
      }
    }
  }
}

export const eventBus = new EventBus();
