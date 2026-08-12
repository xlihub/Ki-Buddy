import { describe, expect, it } from 'vitest';
import { shouldShowAionUiSiderLogout } from '@/renderer/components/layout/Sider/SiderFooter';

describe('Sider account action selection', () => {
  it('preserves the AionUi WebUI logout entry when authenticated', () => {
    expect(shouldShowAionUiSiderLogout({ authenticated: true, electronDesktop: false })).toBe(true);
    expect(shouldShowAionUiSiderLogout({ authenticated: false, electronDesktop: false })).toBe(false);
  });

  it('leaves desktop account actions to desktop product capabilities', () => {
    expect(shouldShowAionUiSiderLogout({ authenticated: true, electronDesktop: true })).toBe(false);
  });
});
