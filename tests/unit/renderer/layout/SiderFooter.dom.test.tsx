import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SiderFooter, { shouldShowAionUiSiderLogout } from '@/renderer/components/layout/Sider/SiderFooter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('Sider account action selection', () => {
  it('preserves the AionUi WebUI logout entry when authenticated', () => {
    expect(shouldShowAionUiSiderLogout({ authenticated: true, electronDesktop: false })).toBe(true);
    expect(shouldShowAionUiSiderLogout({ authenticated: false, electronDesktop: false })).toBe(false);
  });

  it('leaves desktop account actions to desktop product capabilities', () => {
    expect(shouldShowAionUiSiderLogout({ authenticated: true, electronDesktop: true })).toBe(false);
  });

  it('marks the settings footer icon with the shared selected navigation contract', () => {
    render(
      <SiderFooter
        isMobile={false}
        isSettings
        theme='light'
        siderTooltipProps={{}}
        onSettingsClick={vi.fn()}
        onThemeToggle={vi.fn()}
      />
    );

    const selectedItem = screen.getByText('common.back').parentElement;
    expect(selectedItem).toHaveAttribute('data-sider-nav-selected', 'true');
    expect(selectedItem?.querySelector('.sider-nav__icon')).toBeInTheDocument();
  });
});
