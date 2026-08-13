/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SupportedLanguage } from '@/common/config/i18n';
import {
  KI_BUDDY_CORE_TRANSPORT_CHANNEL,
  KI_BUDDY_DEFAULT_LANGUAGE,
  resolveLanguagePreference,
} from '@/common/platform/ki-buddy';
import { registerKiBuddyAuthBridge } from './authBridge';
import type { AgentsAuthService } from './AgentsAuthService';
import { createKiBuddyCoreAuthOptions, type KiBuddyCoreAuthOptions } from './bootstrap';
import { resolveKiBuddyCoreDataPath } from './coreDataPath';
import { KiBuddyMainCoreTransport } from './KiBuddyMainCoreTransport';
import { KI_BUDDY_PRODUCT_RUNTIME, readKiBuddyRuntimeIdentity, shouldEnableKiBuddyRuntime } from './runtimeIdentity';

export type KiBuddyRuntime = {
  coreAuthOptions: KiBuddyCoreAuthOptions;
  coreTransportChannel: typeof KI_BUDDY_CORE_TRANSPORT_CHANNEL;
  productIdentity: typeof KI_BUDDY_PRODUCT_RUNTIME;
  registerAuthBridge: (getCoreBaseUrl: () => string) => AgentsAuthService;
  resolveDataPath: (dataPath: string) => string;
  resolveLanguage: (savedLanguage: string | null | undefined, systemLanguage: string | null) => SupportedLanguage;
};

/** Creates and installs the main-process Ki-Buddy runtime when explicit product metadata selects it. */
export function createKiBuddyRuntime(options: {
  appPath: string;
  resetPassword: boolean;
  webUi: boolean;
}): KiBuddyRuntime | null {
  const enabled = shouldEnableKiBuddyRuntime({
    productIdentity: readKiBuddyRuntimeIdentity(options.appPath),
    resetPassword: options.resetPassword,
    webUi: options.webUi,
  });
  if (!enabled) return null;

  const coreAuthOptions = createKiBuddyCoreAuthOptions();
  const coreTransport = new KiBuddyMainCoreTransport(coreAuthOptions.coreCsrfToken);
  coreTransport.install();

  return {
    coreAuthOptions,
    coreTransportChannel: KI_BUDDY_CORE_TRANSPORT_CHANNEL,
    productIdentity: KI_BUDDY_PRODUCT_RUNTIME,
    registerAuthBridge: (getCoreBaseUrl) =>
      registerKiBuddyAuthBridge({
        bootstrapSecret: coreAuthOptions.bootstrapSecret,
        coreTransport,
        getCoreBaseUrl,
      }),
    resolveDataPath: resolveKiBuddyCoreDataPath,
    resolveLanguage: (savedLanguage, systemLanguage) =>
      resolveLanguagePreference({
        savedLanguage,
        productLanguage: KI_BUDDY_DEFAULT_LANGUAGE,
        systemLanguage,
      }),
  };
}

export { shouldEnsureDefaultCoreUser } from './runtimeIdentity';
