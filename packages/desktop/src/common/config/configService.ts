import type { ConfigKey, ConfigKeyMap } from './configKeys';
import { httpRequest } from '@/common/adapter/httpBridge';

type Subscriber = (value: unknown) => void;

const CLIENT_SCOPED_KEYS = new Set<ConfigKey>(['language']);

class ConfigServiceImpl {
  private cache = new Map<string, unknown>();
  private subscribers = new Map<string, Set<Subscriber>>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private accountGeneration = 0;
  private clientScopedCache = new Map<ConfigKey, unknown>();

  // Idempotent: concurrent callers share the same in-flight promise, and a
  // resolved init returns immediately. Modules that need persisted settings on
  // module load (theme/colorScheme/language) await whenReady() before reading.
  initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    const generation = this.accountGeneration;
    const initialization = (async () => {
      const data = await httpRequest<Record<string, unknown>>('GET', '/api/settings/client');
      if (generation !== this.accountGeneration) return;
      this.cache.clear();
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          this.cache.set(key, value);
        }
      }
      for (const key of CLIENT_SCOPED_KEYS) {
        if (this.clientScopedCache.has(key)) {
          this.cache.set(key, this.clientScopedCache.get(key));
        }
      }
      // One-time theme migration: only when new keys are absent (idempotent).
      if (!this.cache.has('theme.activeId')) {
        const { migrateThemeConfig } = await import('@/common/theme/migrateThemeConfig');
        const migrated = migrateThemeConfig({
          theme: this.cache.get('theme') as string | undefined,
          'css.activeThemeId': this.cache.get('css.activeThemeId') as string | undefined,
          'css.themes': this.cache.get('css.themes') as never,
          customCss: this.cache.get('customCss') as string | undefined,
        });
        this.cache.set('theme.activeId', migrated['theme.activeId']);
        this.cache.set('theme.userThemes', migrated['theme.userThemes']);
        // Persist asynchronously; ignore failure (will re-run next launch).
        void httpRequest<void>('PUT', '/api/settings/client', migrated).catch(() => {});
      }
      this.initialized = true;
    })();
    this.initPromise = initialization;
    initialization.catch(() => {
      // Allow a future caller to retry after a transient failure
      if (this.initPromise === initialization) this.initPromise = null;
    });
    return initialization;
  }

  whenReady(): Promise<void> {
    return this.initialize();
  }

  get<K extends ConfigKey>(key: K): ConfigKeyMap[K] | undefined {
    return this.cache.get(key) as ConfigKeyMap[K] | undefined;
  }

  async set<K extends ConfigKey>(key: K, value: ConfigKeyMap[K]): Promise<void> {
    this.cache.set(key, value);
    if (CLIENT_SCOPED_KEYS.has(key)) this.clientScopedCache.set(key, value);
    this.notify(key, value);
    await httpRequest<void>('PUT', '/api/settings/client', { [key]: value });
  }

  setLocal<K extends ConfigKey>(key: K, value: ConfigKeyMap[K]): void {
    this.cache.set(key, value);
    if (CLIENT_SCOPED_KEYS.has(key)) this.clientScopedCache.set(key, value);
    this.notify(key, value);
  }

  async remove(key: ConfigKey): Promise<void> {
    this.cache.delete(key);
    if (CLIENT_SCOPED_KEYS.has(key)) this.clientScopedCache.delete(key);
    this.notify(key, undefined);
    await httpRequest<void>('PUT', '/api/settings/client', { [key]: null });
  }

  async setBatch(entries: Partial<{ [K in ConfigKey]: ConfigKeyMap[K] }>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
      this.cache.set(key, value);
      if (CLIENT_SCOPED_KEYS.has(key as ConfigKey)) this.clientScopedCache.set(key as ConfigKey, value);
      this.notify(key as ConfigKey, value);
    }
    await httpRequest<void>('PUT', '/api/settings/client', entries);
  }

  subscribe(key: ConfigKey, callback: Subscriber): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key)!.add(callback);
    return () => {
      this.subscribers.get(key)?.delete(callback);
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /** Clears account-scoped values so the next read reloads them for the newly active Core user. */
  resetForAccountChange(): void {
    this.accountGeneration += 1;
    this.cache.clear();
    for (const [key, value] of this.clientScopedCache) this.cache.set(key, value);
    this.initialized = false;
    this.initPromise = null;
  }

  reset(): void {
    this.accountGeneration += 1;
    this.cache.clear();
    this.clientScopedCache.clear();
    this.subscribers.clear();
    this.initialized = false;
    this.initPromise = null;
  }

  private notify(key: ConfigKey, value: unknown): void {
    const subs = this.subscribers.get(key);
    if (subs) {
      for (const cb of subs) {
        cb(value);
      }
    }
  }
}

export const configService = new ConfigServiceImpl();
