/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const installTransportMock = vi.fn();

vi.mock('@/common/adapter/httpBridge', () => ({
  setHttpRequestTransport: installTransportMock,
}));
vi.mock('electron', () => ({
  app: { getPath: vi.fn() },
  ipcMain: { handle: vi.fn() },
  session: { defaultSession: { cookies: { remove: vi.fn(), set: vi.fn() } } },
}));

const { createKiBuddyRuntime } = await import('@/process/ki-buddy');
const { KI_BUDDY_PRODUCT_CONFIG } = await import('@/common/platform/ki-buddy');
const { KiBuddyGitHubProvider } = await import('@/process/ki-buddy/update/githubUpdateProvider');

function createAppPath(productRuntime?: string): string {
  const appPath = mkdtempSync(join(tmpdir(), 'ki-buddy-runtime-'));
  writeFileSync(join(appPath, 'package.json'), JSON.stringify(productRuntime ? { productRuntime } : {}));
  return appPath;
}

describe('Ki-Buddy main-process runtime facade', () => {
  const appPaths: string[] = [];

  afterEach(() => {
    installTransportMock.mockReset();
    for (const appPath of appPaths.splice(0)) rmSync(appPath, { recursive: true, force: true });
  });

  it('does not initialize product transport when the runtime capability is absent', () => {
    const appPath = createAppPath();
    appPaths.push(appPath);

    expect(createKiBuddyRuntime({ appPath, resetPassword: false, webUi: false })).toBeNull();
    expect(installTransportMock).not.toHaveBeenCalled();
  });

  it('initializes product transport only for the explicit Ki-Buddy desktop runtime', () => {
    const appPath = createAppPath('ki-buddy');
    appPaths.push(appPath);

    const runtime = createKiBuddyRuntime({ appPath, resetPassword: false, webUi: false });
    expect(runtime).toMatchObject({
      brand: {
        productName: 'Ki-Buddy',
      },
      productIdentity: 'ki-buddy',
    });
    expect(runtime?.brand.iconPath).toBe(KI_BUDDY_PRODUCT_CONFIG.assets.packaged.icon);
    expect(runtime?.updateBridge).toEqual({
      allowRepositoryOverride: false,
      repository: 'xlihub/Ki-Buddy',
      source: 'github',
      tagPrefix: 'ki-buddy-v',
      userAgent: 'Ki-Buddy',
    });
    expect(runtime?.updateFeed).toEqual({
      feedOptions: {
        owner: 'xlihub',
        provider: 'custom',
        repo: 'Ki-Buddy',
        tagPrefix: 'ki-buddy-v',
        updateProvider: KiBuddyGitHubProvider,
      },
      label: 'Ki-Buddy GitHub provider',
      updaterCacheDirName: 'com.xlihub.ki-buddy',
    });
    expect(installTransportMock).toHaveBeenCalledOnce();
  });
});
