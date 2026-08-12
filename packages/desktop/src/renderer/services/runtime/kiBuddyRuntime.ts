import { KI_BUDDY_DEFAULT_LANGUAGE } from '@/common/platform/ki-buddy';
import type { KiBuddyAuthApi } from '@/common/types/platform/kiBuddyAuth';
import { loadKiBuddyAccountSettings, loadKiBuddyLoginPage, loadKiBuddyStartupGate } from '@/renderer/pages/ki-buddy';
import { createKiBuddyAccountSettingsItem } from '@/renderer/pages/ki-buddy/settingsNavigation';

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

export type KiBuddySettingsItem = ReturnType<typeof createKiBuddyAccountSettingsItem>;

export type KiBuddyRendererRuntime = {
  id: 'ki-buddy';
  authApi: KiBuddyAuthApi;
  createSettingsItem: typeof createKiBuddyAccountSettingsItem;
  defaultLanguage: string | null;
  loadAccountSettings: typeof loadKiBuddyAccountSettings;
  loadLoginPage: typeof loadKiBuddyLoginPage;
  loadStartupGate: typeof loadKiBuddyStartupGate;
};

/** Resolves the Ki-Buddy renderer runtime from its explicit preload capability. */
export function getKiBuddyRendererRuntime(): KiBuddyRendererRuntime | null {
  const authApi = typeof window === 'undefined' ? undefined : window.electronAPI?.kiBuddyAuth;
  if (!authApi) return null;
  return {
    id: 'ki-buddy',
    authApi,
    createSettingsItem: createKiBuddyAccountSettingsItem,
    defaultLanguage: KI_BUDDY_DEFAULT_LANGUAGE ?? null,
    loadAccountSettings: loadKiBuddyAccountSettings,
    loadLoginPage: loadKiBuddyLoginPage,
    loadStartupGate: loadKiBuddyStartupGate,
  };
}

/** Returns Ki-Buddy's settings navigation item when its runtime is active. */
export function getKiBuddySettingsItem(t: TranslateFn): KiBuddySettingsItem | null {
  return getKiBuddyRendererRuntime()?.createSettingsItem(t) ?? null;
}
