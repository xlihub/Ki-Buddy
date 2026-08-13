import { KI_BUDDY_DEFAULT_LANGUAGE } from '@/common/platform/ki-buddy';
import type { KiBuddyAuthApi } from '@/common/types/platform/kiBuddyAuth';
import React from 'react';
import { loadKiBuddyAccountSettings, loadKiBuddyLoginPage, loadKiBuddyStartupGate } from '@/renderer/pages/ki-buddy';
import { createKiBuddyAccountSettingsItem } from '@/renderer/pages/ki-buddy/settingsNavigation';

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

export type KiBuddySettingsItem = ReturnType<typeof createKiBuddyAccountSettingsItem>;

const KI_BUDDY_ROUTE_COMPONENTS = {
  AccountSettings: React.lazy(loadKiBuddyAccountSettings),
  LoginPage: React.lazy(loadKiBuddyLoginPage),
  StartupGate: React.lazy(loadKiBuddyStartupGate),
};

type SettingsItem = {
  id: string;
  label: string;
  icon: React.ReactElement;
  isImageIcon?: boolean;
  path: string;
};

export type KiBuddyRendererRuntime = {
  id: 'ki-buddy';
  authApi: KiBuddyAuthApi;
  defaultLanguage: string | null;
};

/** Resolves the Ki-Buddy renderer runtime from its explicit preload capability. */
export function getKiBuddyRendererRuntime(): KiBuddyRendererRuntime | null {
  const authApi = typeof window === 'undefined' ? undefined : window.electronAPI?.kiBuddyAuth;
  if (!authApi) return null;
  return {
    id: 'ki-buddy',
    authApi,
    defaultLanguage: KI_BUDDY_DEFAULT_LANGUAGE ?? null,
  };
}

/** Returns the product route bundle when the Ki-Buddy runtime is active. */
export function getKiBuddyRouteComponents(): typeof KI_BUDDY_ROUTE_COMPONENTS | null {
  return getKiBuddyRendererRuntime() ? KI_BUDDY_ROUTE_COMPONENTS : null;
}

/** Adds the product account entry to a settings item list when Ki-Buddy is active. */
export function withKiBuddySettingsItem(items: SettingsItem[], t: TranslateFn): SettingsItem[] {
  const item = getKiBuddyRendererRuntime() ? createKiBuddyAccountSettingsItem(t) : null;
  return item ? [item, ...items] : items;
}
