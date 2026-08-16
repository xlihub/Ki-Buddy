import { KI_BUDDY_DEFAULT_LANGUAGE } from '@/common/platform/ki-buddy';
import type { KiBuddyAuthApi } from '@/common/types/platform/kiBuddyAuth';
import React from 'react';
import { loadKiBuddyAccountSettings, loadKiBuddyLoginPage, loadKiBuddyStartupGate } from '@/renderer/pages/ki-buddy';
import { createKiBuddyAccountSettingsItem } from '@/renderer/pages/ki-buddy/settingsNavigation';
import kiBuddyLogoUrl from '@/renderer/assets/ki-buddy/app.png?inline';
import kiBuddyMascotUrl from '@/renderer/assets/ki-buddy/mascot.png';
import type { KiBuddyProductCapability } from '@/common/types/platform/kiBuddyProduct';

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
  authApi: KiBuddyAuthApi;
} & KiBuddyProductRuntime;

export type KiBuddyProductRuntime = {
  brand: KiBuddyProductCapability['brand'] & {
    logoUrl: string;
    mascotUrl: string;
  };
  defaultLanguage: string | null;
  id: 'ki-buddy';
  localeNamespace: string;
  themes: KiBuddyProductCapability['themes'];
};

const KI_BUDDY_ASSET_URLS = {
  'ki-buddy-app': kiBuddyLogoUrl,
  'ki-buddy-mascot': kiBuddyMascotUrl,
} as const;

/** Resolves product-owned renderer semantics from the validated first-frame bootstrap state. */
export function getKiBuddyProductRuntime(): KiBuddyProductRuntime | null {
  const bootstrapError = typeof window === 'undefined' ? null : window.__kiBuddyProductBootstrapError;
  if (bootstrapError) throw new Error(`Ki-Buddy product bootstrap failed: ${bootstrapError}`);
  const product = typeof window === 'undefined' ? null : (window.__kiBuddyProductPresentation ?? null);
  if (!product) return null;
  const logoUrl = KI_BUDDY_ASSET_URLS[product.assets.logo as keyof typeof KI_BUDDY_ASSET_URLS];
  const mascotUrl = KI_BUDDY_ASSET_URLS[product.assets.mascot as keyof typeof KI_BUDDY_ASSET_URLS];
  return {
    id: 'ki-buddy',
    brand: { ...product.brand, logoUrl, mascotUrl },
    defaultLanguage: KI_BUDDY_DEFAULT_LANGUAGE ?? null,
    localeNamespace: product.locale.namespace,
    themes: product.themes,
  };
}

/** Resolves the authenticated Ki-Buddy runtime only when both capabilities are present. */
export function getKiBuddyRendererRuntime(): KiBuddyRendererRuntime | null {
  const productRuntime = getKiBuddyProductRuntime();
  const authApi = typeof window === 'undefined' ? undefined : window.electronAPI?.kiBuddyAuth;
  return productRuntime && authApi ? { ...productRuntime, authApi } : null;
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
