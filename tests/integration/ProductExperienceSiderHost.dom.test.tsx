import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activateKiBuddyProduct } from '../fixtures/kiBuddyProduct';

const testState = vi.hoisted(() => ({ isMobile: false, teamSectionRender: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn(), status: 'authenticated' }),
}));
vi.mock('@renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: testState.isMobile }),
}));
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
vi.mock('@renderer/components/layout/Sider/SiderNav', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/components/layout/Sider/SiderNav')>();
  return {
    ...actual,
    SiderAssistantEntry: () => <div data-workspace-nav-id='assistants' />,
    SiderScheduledEntry: () => <div data-workspace-nav-id='scheduledTasks' />,
    SiderSearchEntry: () => <div data-workspace-nav-id='conversationSearch' />,
    SiderToolbar: ({ showHistoryActions }: { showHistoryActions?: boolean }) => (
      <div data-workspace-nav-id='newConversation' data-history-actions={showHistoryActions ? 'visible' : 'hidden'} />
    ),
  };
});
vi.mock('@renderer/components/layout/Sider/SiderFooter', () => ({
  default: () => null,
  shouldShowAionUiSiderLogout: () => false,
}));
vi.mock('@renderer/pages/conversation/GroupedHistory', () => ({
  default: ({ afterPinnedContent }: { afterPinnedContent?: React.ReactNode }) => (
    <div data-testid='history-host' data-workspace-nav-id='conversationHistory'>
      {afterPinnedContent}
    </div>
  ),
}));
vi.mock('@renderer/pages/settings/components/SettingsSider', () => ({ default: () => null }));
vi.mock('@renderer/components/layout/Sider/TeamSiderSection', () => ({
  default: () => {
    testState.teamSectionRender();
    return <div data-workspace-nav-id='team'>team-navigation</div>;
  },
}));

import Sider from '@/renderer/components/layout/Sider';
import { getWorkspaceExperienceProjection } from '@/renderer/components/layout/Sider/SiderNav/workspaceRegistry';

function workspaceNavigationIds(container: HTMLElement): Array<string | null> {
  return Array.from(container.querySelectorAll('[data-workspace-nav-id]')).map((item) =>
    item.getAttribute('data-workspace-nav-id')
  );
}

describe('Product experience Sider host', () => {
  beforeEach(() => {
    testState.isMobile = false;
    testState.teamSectionRender.mockClear();
    window.__kiBuddyProductBootstrapError = null;
    window.__kiBuddyProductPresentation = null;
  });

  it.each(['conversation', 'assistants', 'scheduledTasks', 'team'] as const)(
    'projects %s routes and navigation from one workspace registry',
    (featureId) => {
      activateKiBuddyProduct({ [featureId]: 'disabled' });

      const projection = getWorkspaceExperienceProjection();

      expect(projection.routes.some((route) => route.featureId === featureId)).toBe(false);
      expect(projection.navigation.some((item) => item.featureId === featureId)).toBe(false);
    }
  );

  it('does not mount Team navigation or its subscriptions in Ki-Buddy', async () => {
    activateKiBuddyProduct();

    const { container } = render(
      <MemoryRouter initialEntries={['/guid']}>
        <Sider />
      </MemoryRouter>
    );

    await screen.findByTestId('history-host');
    expect(workspaceNavigationIds(container)).toEqual([
      'newConversation',
      'assistants',
      'scheduledTasks',
      'conversationHistory',
    ]);
    expect(screen.queryByText('team-navigation')).not.toBeInTheDocument();
    expect(testState.teamSectionRender).not.toHaveBeenCalled();
  });

  it.each([
    {
      layout: 'desktop',
      isMobile: false,
      featureId: 'assistants',
      expectedIds: ['newConversation', 'scheduledTasks', 'conversationHistory'],
      expectedHistoryActions: 'visible',
    },
    {
      layout: 'desktop',
      isMobile: false,
      featureId: 'conversation',
      expectedIds: ['newConversation', 'assistants', 'scheduledTasks'],
      expectedHistoryActions: 'hidden',
    },
    {
      layout: 'desktop',
      isMobile: false,
      featureId: 'scheduledTasks',
      expectedIds: ['newConversation', 'assistants', 'conversationHistory'],
      expectedHistoryActions: 'visible',
    },
    {
      layout: 'mobile',
      isMobile: true,
      featureId: 'assistants',
      expectedIds: ['newConversation', 'conversationSearch', 'scheduledTasks', 'conversationHistory'],
      expectedHistoryActions: 'visible',
    },
    {
      layout: 'mobile',
      isMobile: true,
      featureId: 'conversation',
      expectedIds: ['newConversation', 'assistants', 'scheduledTasks'],
      expectedHistoryActions: 'hidden',
    },
    {
      layout: 'mobile',
      isMobile: true,
      featureId: 'scheduledTasks',
      expectedIds: ['newConversation', 'conversationSearch', 'assistants', 'conversationHistory'],
      expectedHistoryActions: 'visible',
    },
  ] as const)(
    'projects $layout workspace navigation independently when $featureId is disabled',
    async ({ isMobile, featureId, expectedIds, expectedHistoryActions }) => {
      testState.isMobile = isMobile;
      activateKiBuddyProduct({ [featureId]: 'disabled' });

      const { container } = render(
        <MemoryRouter initialEntries={['/guid']}>
          <Sider />
        </MemoryRouter>
      );

      await waitFor(() => expect(workspaceNavigationIds(container)).toEqual(expectedIds));
      expect(container.querySelector('[data-workspace-nav-id="newConversation"]')).toHaveAttribute(
        'data-history-actions',
        expectedHistoryActions
      );
      expect(testState.teamSectionRender).not.toHaveBeenCalled();
    }
  );

  it('keeps Team navigation independent from conversation history state', async () => {
    activateKiBuddyProduct({
      assistants: 'disabled',
      conversation: 'disabled',
      scheduledTasks: 'disabled',
      team: 'enabled',
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/guid']}>
        <Sider />
      </MemoryRouter>
    );

    expect(await screen.findByText('team-navigation')).toBeInTheDocument();
    expect(workspaceNavigationIds(container)).toEqual(['newConversation', 'team']);
    expect(screen.queryByTestId('history-host')).not.toBeInTheDocument();
    expect(testState.teamSectionRender).toHaveBeenCalledOnce();
  });

  it('keeps Team navigation mounted for the AionUi adapter', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/guid']}>
        <Sider />
      </MemoryRouter>
    );

    expect(await screen.findByText('team-navigation')).toBeInTheDocument();
    expect(workspaceNavigationIds(container)).toEqual([
      'newConversation',
      'assistants',
      'scheduledTasks',
      'conversationHistory',
      'team',
    ]);
    await waitFor(() => expect(testState.teamSectionRender).toHaveBeenCalledOnce());
  });
});
