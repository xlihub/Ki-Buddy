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
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: () => configFixture.savedLanguage,
    set: vi.fn().mockResolvedValue(undefined),
    whenReady: vi.fn(() => configFixture.ready),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: {
      changeLanguage: { invoke: vi.fn().mockResolvedValue(undefined) },
      languageChanged: { on: vi.fn() },
    },
  },
}));

describe('Ki-Buddy startup language', () => {
  beforeEach(() => {
    vi.resetModules();
    configFixture.savedLanguage = undefined;
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

  it('uses the saved desktop language before a stale local hint', async () => {
    configFixture.savedLanguage = 'en-US';
    localStorage.setItem('i18nextLng', 'zh-CN');
    window.__initialLanguage = 'en-US';

    const { default: i18n } = await import('@/renderer/services/i18n');

    expect(i18n.language).toBe('en-US');
    configFixture.resolveReady();
    await waitFor(() => expect(localStorage.getItem('i18nextLng')).toBe('en-US'));
    expect(i18n.language).toBe('en-US');
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
