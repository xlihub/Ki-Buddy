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
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn() },
  session: { defaultSession: { cookies: { remove: vi.fn(), set: vi.fn() } } },
}));

const {
  createKiBuddyProductBootstrap,
  createKiBuddyProductIntegrityWindow,
  createKiBuddyRuntime,
  shouldStartProductBusinessLifecycle,
  startProductFeatureLifecycles,
} = await import('@/process/ki-buddy');
const { BrowserWindow } = await import('electron');
const { KI_BUDDY_PRODUCT_CONFIG_RESULT, createAionUiProductExperience } = await import('@/common/platform/ki-buddy');
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
    vi.mocked(BrowserWindow).mockReset();
    for (const appPath of appPaths.splice(0)) rmSync(appPath, { recursive: true, force: true });
  });

  it('does not initialize product transport when the runtime capability is absent', () => {
    const appPath = createAppPath();
    appPaths.push(appPath);

    expect(createKiBuddyRuntime({ appPath, resetPassword: false, webUi: false })).toEqual({
      status: 'absent',
      productIdentity: null,
      runtime: null,
      error: null,
    });
    expect(installTransportMock).not.toHaveBeenCalled();
  });

  it('initializes product transport only for the explicit Ki-Buddy desktop runtime', () => {
    const appPath = createAppPath('ki-buddy');
    appPaths.push(appPath);

    const selection = createKiBuddyRuntime({ appPath, resetPassword: false, webUi: false });
    const runtime = selection.runtime!;
    const bootstrap = createKiBuddyProductBootstrap(selection);
    expect(selection.status).toBe('ready');
    expect(bootstrap).toMatchObject({
      status: 'ready',
      productIdentity: 'ki-buddy',
      capability: { experience: { features: { team: 'disabled' } } },
      error: null,
    });
    expect(runtime).toMatchObject({
      brand: {
        productName: 'Ki-Buddy',
      },
      productIdentity: 'ki-buddy',
    });
    expect(runtime.brand.iconPath).toBe(KI_BUDDY_PRODUCT_CONFIG_RESULT.config?.assets.packaged.icon);
    expect(runtime.productCapability.experience).toBe(KI_BUDDY_PRODUCT_CONFIG_RESULT.config?.experience);
    expect(Object.isFrozen(bootstrap)).toBe(true);
    expect(Object.isFrozen(bootstrap.capability?.brand)).toBe(true);
    expect(Object.isFrozen(bootstrap.capability?.brand.links)).toBe(true);
    expect(Object.isFrozen(bootstrap.capability?.experience.resources.assistant)).toBe(true);
    expect(runtime.productExperience.featureState('team')).toBe('disabled');
    expect(runtime.updateBridge).toEqual({
      allowRepositoryOverride: false,
      repository: 'xlihub/Ki-Buddy',
      source: 'github',
      tagPrefix: 'ki-buddy-v',
      userAgent: 'Ki-Buddy',
    });
    expect(runtime.updateFeed).toEqual({
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

  it('keeps a recognized Ki-Buddy runtime invalid without starting product side effects', () => {
    const appPath = createAppPath('ki-buddy');
    appPaths.push(appPath);

    const selection = createKiBuddyRuntime(
      { appPath, resetPassword: false, webUi: false },
      { config: null, error: 'Product experience features has invalid fields: missing team' }
    );

    expect(selection).toEqual({
      status: 'invalid',
      productIdentity: 'ki-buddy',
      runtime: null,
      error: expect.stringContaining('missing team'),
    });
    const bootstrap = createKiBuddyProductBootstrap(selection);
    expect(Object.isFrozen(bootstrap)).toBe(true);
    expect(bootstrap).toMatchObject({
      status: 'invalid',
      capability: null,
      error: expect.stringContaining('missing team'),
    });
    expect(shouldStartProductBusinessLifecycle(selection)).toBe(false);
    expect(installTransportMock).not.toHaveBeenCalled();
  });

  it.each([
    { mode: 'WebUI', resetPassword: false, webUi: true },
    { mode: 'password reset', resetPassword: true, webUi: false },
  ])('keeps invalid Ki-Buddy configuration isolated in $mode mode', ({ resetPassword, webUi }) => {
    const appPath = createAppPath('ki-buddy');
    appPaths.push(appPath);

    const selection = createKiBuddyRuntime(
      { appPath, resetPassword, webUi },
      { config: null, error: 'Product runtime identity is invalid' }
    );

    expect(selection.status).toBe('invalid');
    expect(createKiBuddyProductBootstrap(selection).status).toBe('invalid');
    expect(shouldStartProductBusinessLifecycle(selection)).toBe(false);
  });

  it('starts the business lifecycle for valid Ki-Buddy and ordinary AionUi selections', () => {
    const kiBuddyAppPath = createAppPath('ki-buddy');
    const aionUiAppPath = createAppPath();
    appPaths.push(kiBuddyAppPath, aionUiAppPath);

    expect(
      shouldStartProductBusinessLifecycle(
        createKiBuddyRuntime({ appPath: kiBuddyAppPath, resetPassword: false, webUi: false })
      )
    ).toBe(true);
    expect(
      shouldStartProductBusinessLifecycle(
        createKiBuddyRuntime({ appPath: aionUiAppPath, resetPassword: false, webUi: false })
      )
    ).toBe(true);
  });

  it('creates the product-owned integrity window without initializing a business host', () => {
    const integrityWindow = {
      isDestroyed: vi.fn(() => false),
      loadFile: vi.fn(() => Promise.resolve()),
      loadURL: vi.fn(() => Promise.resolve()),
      once: vi.fn((_event: string, listener: () => void) => listener()),
      show: vi.fn(),
    };
    vi.mocked(BrowserWindow).mockImplementation(function BrowserWindowMock() {
      return integrityWindow as never;
    });

    const window = createKiBuddyProductIntegrityWindow({
      isPackaged: true,
      preloadPath: '/app/preload.js',
      rendererFile: '/app/renderer/index.html',
    });

    expect(window).toBe(integrityWindow);
    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Ki-Buddy', webPreferences: { preload: '/app/preload.js' } })
    );
    expect(integrityWindow.loadFile).toHaveBeenCalledWith('/app/renderer/index.html');
    expect(integrityWindow.loadURL).not.toHaveBeenCalled();
    expect(integrityWindow.show).toHaveBeenCalledOnce();
  });

  it('skips disabled Team main lifecycles while retaining enabled Ki-Buddy lifecycles', () => {
    const appPath = createAppPath('ki-buddy');
    appPaths.push(appPath);
    const runtime = createKiBuddyRuntime({ appPath, resetPassword: false, webUi: false }).runtime!;
    const startTeam = vi.fn();
    const startScheduledTasks = vi.fn();

    runtime.startFeatureLifecycles([
      { featureId: 'team', start: startTeam },
      { featureId: 'scheduledTasks', start: startScheduledTasks },
    ]);

    expect(startTeam).not.toHaveBeenCalled();
    expect(startScheduledTasks).toHaveBeenCalledOnce();
  });

  it('retains existing Team main lifecycles for the AionUi adapter', () => {
    const startTeam = vi.fn();

    startProductFeatureLifecycles(createAionUiProductExperience(), [{ featureId: 'team', start: startTeam }]);

    expect(startTeam).toHaveBeenCalledOnce();
  });
});
