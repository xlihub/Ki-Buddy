import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KI_BUDDY_PRODUCT_CAPABILITY } from '@/common/platform/ki-buddy';

const teamSectionRender = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn(), status: 'authenticated' }),
}));
vi.mock('@renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: false }) }));
vi.mock('@renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', setTheme: vi.fn() }),
}));
vi.mock('@renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ closePreview: vi.fn(), clearPreviewForScope: vi.fn() }),
}));
vi.mock('@renderer/utils/ui/focus', () => ({ blurActiveElement: vi.fn() }));
vi.mock('@renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: vi.fn(),
  getSiderTooltipProps: () => ({}),
}));
vi.mock('@renderer/components/layout/Sider/SiderNav', () => ({
  SiderAssistantEntry: () => null,
  SiderScheduledEntry: () => null,
  SiderSearchEntry: () => null,
  SiderToolbar: () => null,
}));
vi.mock('@renderer/components/layout/Sider/SiderFooter', () => ({
  default: () => null,
  shouldShowAionUiSiderLogout: () => false,
}));
vi.mock('@renderer/pages/conversation/GroupedHistory', () => ({
  default: ({ afterPinnedContent }: { afterPinnedContent?: React.ReactNode }) => (
    <div data-testid='history-host'>{afterPinnedContent}</div>
  ),
}));
vi.mock('@renderer/pages/settings/components/SettingsSider', () => ({ default: () => null }));
vi.mock('@renderer/components/layout/Sider/TeamSiderSection', () => ({
  default: () => {
    teamSectionRender();
    return <div>team-navigation</div>;
  },
}));

import Sider from '@/renderer/components/layout/Sider';

describe('Product experience Sider host', () => {
  beforeEach(() => {
    teamSectionRender.mockClear();
    window.__kiBuddyProductBootstrapError = null;
    window.__kiBuddyProductPresentation = null;
  });

  it('does not mount Team navigation or its subscriptions in Ki-Buddy', async () => {
    window.__kiBuddyProductPresentation = KI_BUDDY_PRODUCT_CAPABILITY;

    render(
      <MemoryRouter initialEntries={['/guid']}>
        <Sider />
      </MemoryRouter>
    );

    await screen.findByTestId('history-host');
    expect(screen.queryByText('team-navigation')).not.toBeInTheDocument();
    expect(teamSectionRender).not.toHaveBeenCalled();
  });

  it('keeps Team navigation mounted for the AionUi adapter', async () => {
    render(
      <MemoryRouter initialEntries={['/guid']}>
        <Sider />
      </MemoryRouter>
    );

    expect(await screen.findByText('team-navigation')).toBeInTheDocument();
    await waitFor(() => expect(teamSectionRender).toHaveBeenCalledOnce());
  });
});
