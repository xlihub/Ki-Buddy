import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KI_BUDDY_PRODUCT_CAPABILITY } from '@/common/platform/ki-buddy';
import {
  getKiBuddyProductRuntime,
  getKiBuddyRendererRuntime,
  getKiBuddyRouteComponents,
  withKiBuddySettingsItem,
} from '@/renderer/services/runtime/kiBuddyRuntime';

const translateKey = (key: string) => key;

describe('Ki-Buddy renderer runtime selection', () => {
  beforeEach(() => {
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth: undefined };
    window.__kiBuddyProductPresentation = null;
    window.__kiBuddyProductBootstrapError = null;
  });

  it('keeps product routes and settings absent without the product capability', () => {
    expect(getKiBuddyRendererRuntime()).toBeNull();
    expect(getKiBuddyRouteComponents()).toBeNull();
    expect(withKiBuddySettingsItem([], translateKey)).toEqual([]);
  });

  it('exposes product branding independently of authentication', () => {
    window.__kiBuddyProductPresentation = KI_BUDDY_PRODUCT_CAPABILITY;

    expect(getKiBuddyProductRuntime()).toMatchObject({
      id: 'ki-buddy',
      localeNamespace: 'kiBuddy',
      themes: { light: 'ki-buddy-light', dark: 'ki-buddy-dark' },
    });
    expect(getKiBuddyRendererRuntime()).toBeNull();
  });

  it('activates product routes when product and auth capabilities are both present', () => {
    const kiBuddyAuth = { getSession: vi.fn(), login: vi.fn(), logout: vi.fn() };
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth };
    window.__kiBuddyProductPresentation = KI_BUDDY_PRODUCT_CAPABILITY;

    expect(getKiBuddyRendererRuntime()).toMatchObject({ id: 'ki-buddy', authApi: kiBuddyAuth });
    expect(getKiBuddyRouteComponents()).toMatchObject({
      AccountSettings: expect.any(Object),
      LoginPage: expect.any(Object),
      StartupGate: expect.any(Object),
    });
    expect(withKiBuddySettingsItem([], translateKey)[0]).toMatchObject({ id: 'account', path: 'account' });
  });

  it('does not access the preload capability after bootstrap', () => {
    window.__kiBuddyProductPresentation = KI_BUDDY_PRODUCT_CAPABILITY;
    window.__getKiBuddyProductPresentation = vi.fn(() => {
      throw new Error('bootstrap bridge must not be read after the first frame');
    });

    expect(getKiBuddyProductRuntime()).toMatchObject({ id: 'ki-buddy' });
    expect(window.__getKiBuddyProductPresentation).not.toHaveBeenCalled();
  });

  it('fails renderer startup when the first-frame product capability is invalid', () => {
    window.__kiBuddyProductBootstrapError = 'Invalid Ki-Buddy product presentation capability';

    expect(() => getKiBuddyProductRuntime()).toThrow('Ki-Buddy product bootstrap failed');
  });
});
