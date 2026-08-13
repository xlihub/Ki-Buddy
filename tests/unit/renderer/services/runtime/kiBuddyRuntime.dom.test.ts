import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getKiBuddyRendererRuntime,
  getKiBuddyRouteComponents,
  withKiBuddySettingsItem,
} from '@/renderer/services/runtime/kiBuddyRuntime';

const translateKey = (key: string) => key;

describe('Ki-Buddy renderer runtime selection', () => {
  beforeEach(() => {
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth: undefined };
  });

  it('preserves the AionUi runtime when no product capability is present', () => {
    expect(getKiBuddyRendererRuntime()).toBeNull();
    expect(getKiBuddyRouteComponents()).toBeNull();
    expect(withKiBuddySettingsItem([], translateKey)).toEqual([]);
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
    expect(getKiBuddyRouteComponents()).toMatchObject({
      AccountSettings: expect.any(Object),
      LoginPage: expect.any(Object),
      StartupGate: expect.any(Object),
    });
    expect(withKiBuddySettingsItem([], translateKey)[0]).toMatchObject({ id: 'account', path: 'account' });
  });
});
