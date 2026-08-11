/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configFixture = vi.hoisted(() => ({
  ready: Promise.resolve(),
  resolveReady: () => {},
  savedLanguage: undefined as string | undefined,
  setLanguage: vi.fn().mockResolvedValue(undefined),
}));

const ipcFixture = vi.hoisted(() => ({
  changeLanguage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: () => configFixture.savedLanguage,
    set: configFixture.setLanguage,
    whenReady: vi.fn(() => configFixture.ready),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: {
      changeLanguage: { invoke: ipcFixture.changeLanguage },
      languageChanged: { on: vi.fn() },
    },
  },
}));

describe('Ki-Buddy startup language', () => {
  beforeEach(() => {
    vi.resetModules();
    configFixture.savedLanguage = undefined;
    configFixture.setLanguage.mockReset();
    configFixture.setLanguage.mockResolvedValue(undefined);
    ipcFixture.changeLanguage.mockClear();
    configFixture.ready = new Promise<void>((resolve) => {
      configFixture.resolveReady = resolve;
    });
    localStorage.clear();
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'en-US' });
    Object.defineProperty(window, '__initialLanguage', { configurable: true, value: null, writable: true });
    window.electronAPI = {
      ...window.electronAPI,
      kiBuddyAuth: {
        getSession: vi.fn().mockResolvedValue({ status: 'unauthenticated', user: null }),
        login: vi.fn().mockResolvedValue({ success: false, code: 'invalidCredentials' }),
        logout: vi.fn().mockResolvedValue({ status: 'unauthenticated', user: null }),
      },
    };
  });

  it('initializes login and onboarding in Chinese without switching to English after config is ready', async () => {
    const { default: i18n } = await import('@/renderer/services/i18n');

    expect(i18n.language).toBe('zh-CN');
    configFixture.resolveReady();
    await waitFor(() => expect(localStorage.getItem('i18nextLng')).toBe('zh-CN'));
    expect(i18n.language).toBe('zh-CN');
  });

  it('uses the saved desktop language when no local selection exists', async () => {
    configFixture.savedLanguage = 'en-US';
    window.__initialLanguage = 'en-US';

    const { default: i18n } = await import('@/renderer/services/i18n');

    expect(i18n.language).toBe('en-US');
    configFixture.resolveReady();
    await waitFor(() => expect(localStorage.getItem('i18nextLng')).toBe('en-US'));
    expect(i18n.language).toBe('en-US');
  });

  it('keeps a manual local selection ahead of a stale process hint and the product default', async () => {
    localStorage.setItem('i18nextLng', 'en-US');
    window.__initialLanguage = 'zh-CN';

    const { default: i18n } = await import('@/renderer/services/i18n');

    expect(i18n.language).toBe('en-US');
    configFixture.resolveReady();
    await waitFor(() => expect(localStorage.getItem('i18nextLng')).toBe('en-US'));
    expect(i18n.language).toBe('en-US');
  });

  it('keeps a manual selection for restart when Core persistence is temporarily unavailable', async () => {
    configFixture.ready = Promise.resolve();
    const { changeLanguage } = await import('@/renderer/services/i18n');
    configFixture.setLanguage.mockRejectedValueOnce(new Error('Core settings unavailable'));

    await expect(changeLanguage('en-US')).rejects.toThrow('Core settings unavailable');

    expect(localStorage.getItem('i18nextLng')).toBe('en-US');
    expect(ipcFixture.changeLanguage).toHaveBeenCalledWith({ language: 'en-US' });
  });

  it('retries the authoritative Core language after Ki-Buddy authentication', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectReady: ((error: Error) => void) | undefined;
    configFixture.ready = new Promise<void>((_resolve, reject) => {
      rejectReady = reject;
    });
    const languageModule = await import('@/renderer/services/i18n');
    rejectReady?.(new Error('Core authentication required'));
    await waitFor(() => expect(consoleError).toHaveBeenCalled());

    configFixture.savedLanguage = 'en-US';
    configFixture.ready = Promise.resolve();
    await languageModule.syncLanguageFromConfig();

    expect(languageModule.default.language).toBe('en-US');
    expect(localStorage.getItem('i18nextLng')).toBe('en-US');
  });

  it('preserves upstream AionUi startup behavior when the Ki-Buddy capability is absent', async () => {
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'ja-JP' });
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth: undefined };

    const { default: i18n } = await import('@/renderer/services/i18n');

    expect(i18n.language).toBe('en-US');
    configFixture.resolveReady();
    await waitFor(() => expect(localStorage.getItem('i18nextLng')).toBe('ja-JP'));
    expect(i18n.language).toBe('ja-JP');
  });
});
