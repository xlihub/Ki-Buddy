import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridgeStarts = vi.hoisted(() => ({
  application: vi.fn(),
  dialog: vi.fn(),
  notification: vi.fn(),
  petSettings: vi.fn(),
  systemSettings: vi.fn(),
  theme: vi.fn(),
  update: vi.fn(),
  webUi: vi.fn(),
  windowControls: vi.fn(),
}));
const trayMenu = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: Electron.MenuItemConstructorOptions[]) => template),
  getConversations: vi.fn().mockResolvedValue({ items: [] }),
}));
const extensionRenderer = vi.hoisted(() => ({
  featureState: vi.fn(() => 'enabled'),
  getSettingsTabs: vi.fn(),
  getTranslations: vi.fn(),
  subscribeState: vi.fn(() => vi.fn()),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: { getUserConversations: { invoke: trayMenu.getConversations } },
  },
}));
vi.mock('@/common/electronSafe', () => ({
  electronApp: { exit: vi.fn(), isPackaged: false, relaunch: vi.fn() },
  electronMenu: { buildFromTemplate: trayMenu.buildFromTemplate },
  electronNativeImage: { createFromPath: vi.fn() },
  electronTray: vi.fn(),
}));
vi.mock('@/common/adapter/ipcBridge', () => ({
  extensions: {
    getExtI18nForLocale: { invoke: extensionRenderer.getTranslations },
    getSettingsTabs: { invoke: extensionRenderer.getSettingsTabs },
    stateChanged: { on: extensionRenderer.subscribeState },
  },
}));
vi.mock('@/process/services/i18n', () => ({
  default: { t: (key: string) => key },
}));
vi.mock('@/renderer/services/runtime/kiBuddyRuntime', () => ({
  isExtensionSettingsContributionEnabled: () =>
    extensionRenderer.featureState('extensionRuntime') === 'enabled' &&
    extensionRenderer.featureState('extensionSettings') === 'enabled',
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en-US' } }),
}));

vi.mock('@/process/bridge/applicationBridge', () => ({ initApplicationBridge: bridgeStarts.application }));
vi.mock('@/process/bridge/dialogBridge', () => ({ initDialogBridge: bridgeStarts.dialog }));
vi.mock('@/process/bridge/notificationBridge', () => ({ initNotificationBridge: bridgeStarts.notification }));
vi.mock('@/process/bridge/systemSettingsBridge', () => ({
  initPetSettingsBridge: bridgeStarts.petSettings,
  initSystemSettingsBridge: bridgeStarts.systemSettings,
}));
vi.mock('@/process/bridge/themeBridge', () => ({ initThemeBridge: bridgeStarts.theme }));
vi.mock('@/process/bridge/updateBridge', () => ({ initUpdateBridge: bridgeStarts.update }));
vi.mock('@/process/bridge/webuiBridge', () => ({ initWebuiBridge: bridgeStarts.webUi }));
vi.mock('@/process/bridge/windowControlsBridge', () => ({
  initWindowControlsBridge: bridgeStarts.windowControls,
  registerWindowMaximizeListeners: vi.fn(),
}));

const { initAllBridges } = await import('@/process/bridge');
const { startMainProductLifecyclePhase } = await import('@/process/ki-buddy');
const { buildTrayContextMenu, configureTrayProductExperience } = await import('@/process/utils/tray');
const { useExtI18n } = await import('@/renderer/hooks/system/useExtI18n');
const { useExtensionSettingsTabs } = await import('@/renderer/hooks/system/useExtensionSettingsTabs');
const { KI_BUDDY_PRODUCT_CONFIG_RESULT, createAionUiProductExperience, createKiBuddyProductExperience } =
  await import('@/common/platform/ki-buddy');

const kiBuddyExperience = createKiBuddyProductExperience(KI_BUDDY_PRODUCT_CONFIG_RESULT.config?.experience);

describe('ProductExperience lifecycle host across main and renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extensionRenderer.featureState.mockReturnValue('enabled');
    extensionRenderer.getSettingsTabs.mockResolvedValue([]);
    extensionRenderer.getTranslations.mockResolvedValue({});
  });

  it('does not fetch or subscribe to Extension settings contributions when their runtime is disabled', () => {
    extensionRenderer.featureState.mockImplementation((featureId: string) => kiBuddyExperience.featureState(featureId));

    const settingsTabs = renderHook(() => useExtensionSettingsTabs());
    const translations = renderHook(() => useExtI18n());
    const tab = {
      extensionName: 'legacy-extension',
      id: 'legacy',
      label: 'Legacy extension',
      order: 0,
      url: '/legacy-extension',
    };

    expect(settingsTabs.result.current).toEqual([]);
    expect(translations.result.current.resolveExtTabName(tab)).toBe(tab.label);
    expect(extensionRenderer.getSettingsTabs).not.toHaveBeenCalled();
    expect(extensionRenderer.getTranslations).not.toHaveBeenCalled();
    expect(extensionRenderer.subscribeState).not.toHaveBeenCalled();
  });

  it('preserves Extension settings contributions for the complete AionUi adapter', async () => {
    extensionRenderer.getSettingsTabs.mockResolvedValue([
      {
        extensionName: 'sample-extension',
        id: 'sample',
        label: 'Sample extension',
        order: 0,
        url: '/sample-extension',
      },
    ]);

    const settingsTabs = renderHook(() => useExtensionSettingsTabs());
    renderHook(() => useExtI18n());

    await waitFor(() => expect(settingsTabs.result.current).toHaveLength(1));
    expect(extensionRenderer.getSettingsTabs).toHaveBeenCalledOnce();
    expect(extensionRenderer.getTranslations).toHaveBeenCalledWith({ locale: 'en-US' });
    expect(extensionRenderer.subscribeState).toHaveBeenCalledOnce();
  });

  it('keeps disabled Ki-Buddy lifecycles free of startup side effects', async () => {
    initAllBridges({ productExperience: kiBuddyExperience });
    configureTrayProductExperience(kiBuddyExperience);
    const starts = {
      petAutostart: vi.fn(),
      scheduledTasks: vi.fn(),
      webUiAutostart: vi.fn(),
    };

    startMainProductLifecyclePhase(kiBuddyExperience, 'backendReady', {
      scheduledTasks: starts.scheduledTasks,
    });
    startMainProductLifecyclePhase(kiBuddyExperience, 'desktopReady', {
      desktopPet: starts.petAutostart,
      webUi: starts.webUiAutostart,
    });

    expect(bridgeStarts.petSettings).not.toHaveBeenCalled();
    expect(bridgeStarts.webUi).not.toHaveBeenCalled();
    expect(starts.petAutostart).not.toHaveBeenCalled();
    expect(starts.webUiAutostart).not.toHaveBeenCalled();
    expect(starts.scheduledTasks).toHaveBeenCalledOnce();
    expect(await buildTrayContextMenu()).not.toContainEqual(expect.objectContaining({ label: '🐾 pet.desktopPet' }));
  });

  it('preserves every existing lifecycle through the AionUi adapter', async () => {
    const experience = createAionUiProductExperience();
    configureTrayProductExperience(experience);
    const starts = {
      pet: vi.fn(),
      scheduledTasks: vi.fn(),
      webUi: vi.fn(),
    };

    initAllBridges({ productExperience: experience });
    startMainProductLifecyclePhase(experience, 'backendReady', {
      scheduledTasks: starts.scheduledTasks,
    });
    startMainProductLifecyclePhase(experience, 'desktopReady', {
      desktopPet: starts.pet,
      webUi: starts.webUi,
    });

    expect(bridgeStarts.petSettings).toHaveBeenCalledOnce();
    expect(bridgeStarts.webUi).toHaveBeenCalledOnce();
    expect(starts.pet).toHaveBeenCalledOnce();
    expect(starts.scheduledTasks).toHaveBeenCalledOnce();
    expect(starts.webUi).toHaveBeenCalledOnce();
    expect(await buildTrayContextMenu()).toContainEqual(expect.objectContaining({ label: '🐾 pet.desktopPet' }));
  });
});
