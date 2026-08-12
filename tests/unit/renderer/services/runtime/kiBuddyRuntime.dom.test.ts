import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getKiBuddyRendererRuntime, getKiBuddySettingsItem } from '@/renderer/services/runtime/kiBuddyRuntime';

const translateKey = (key: string) => key;

describe('Ki-Buddy renderer runtime selection', () => {
  beforeEach(() => {
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth: undefined };
  });

  it('preserves the AionUi runtime when no product capability is present', () => {
    expect(getKiBuddyRendererRuntime()).toBeNull();
    expect(getKiBuddySettingsItem(translateKey)).toBeNull();
  });

  it('selects the Ki-Buddy runtime only when its preload capability is present', () => {
    const kiBuddyAuth = {
      getSession: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    };
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth };

    expect(getKiBuddyRendererRuntime()).toMatchObject({
      id: 'ki-buddy',
      authApi: kiBuddyAuth,
      defaultLanguage: 'zh-CN',
    });
    expect(getKiBuddySettingsItem(translateKey)).toMatchObject({ id: 'account', path: 'account' });
  });
});
