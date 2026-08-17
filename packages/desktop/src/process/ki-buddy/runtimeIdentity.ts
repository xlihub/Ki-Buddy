/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KI_BUDDY_PRODUCT_CONFIG_RESULT,
  resolveKiBuddyRuntimeIdentity,
  type KiBuddyProductConfigLoadResult,
} from '@/common/platform/ki-buddy';

export { KI_BUDDY_PRODUCT_RUNTIME, resolveKiBuddyRuntimeIdentity } from '@/common/platform/ki-buddy';

/** Reads the effective packaged metadata and fails closed when it is unavailable or invalid. */
export function readKiBuddyRuntimeIdentity(appPath: string): boolean {
  try {
    return resolveKiBuddyRuntimeIdentity(JSON.parse(readFileSync(join(appPath, 'package.json'), 'utf8')));
  } catch {
    return false;
  }
}

/** Resolves the packaged product protocol without enabling any product runtime side effects. */
export function resolveKiBuddyProtocolScheme(
  appPath: string,
  productConfigResult: KiBuddyProductConfigLoadResult = KI_BUDDY_PRODUCT_CONFIG_RESULT
): string | null {
  return readKiBuddyRuntimeIdentity(appPath)
    ? (productConfigResult.config?.electronBuilder.protocolScheme ?? null)
    : null;
}

/** Selects the Ki-Buddy desktop runtime without conflating it with other Electron modes. */
export function shouldEnableKiBuddyRuntime(options: {
  productIdentity: boolean;
  resetPassword: boolean;
  webUi: boolean;
}): boolean {
  return options.productIdentity && !options.webUi && !options.resetPassword;
}

/** Keeps AionUi's default Core user bootstrap outside the isolated Ki-Buddy desktop runtime. */
export function shouldEnsureDefaultCoreUser(kiBuddyRuntime: boolean): boolean {
  return !kiBuddyRuntime;
}
