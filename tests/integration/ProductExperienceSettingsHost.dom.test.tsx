import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Outlet } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activateKiBuddyProduct } from '../fixtures/kiBuddyProduct';

const mocks = vi.hoisted(() => ({
  assistantPageRender: vi.fn(),
  authStatus: 'authenticated' as 'authenticated' | 'checking' | 'unauthenticated',
  configGet: vi.fn(() => []),
  extensionPageRender: vi.fn(),
  extensionThemes: vi.fn(async () => []),
  extensionTabs: vi.fn(() => []),
  extensionTranslations: vi.fn(() => ({ resolveExtTabName: (tab: { label: string }) => tab.label })),
  isMobile: false,
  petPageRender: vi.fn(),
  showcasePageRender: vi.fn(),
  themeSettingsRender: vi.fn(),
  webuiGetStatus: vi.fn(async () => ({ running: false })),
  webuiPageRender: vi.fn(),
  webuiStatusChanged: vi.fn(() => vi.fn()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));
vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: mocks.authStatus }),
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: mocks.isMobile }),
}));
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({
    activeId: 'light',
    activeTheme: null,
    fontSizes: { chat: 14, markdown: 14, code: 13 },
    selectTheme: vi.fn(),
    setFontSize: vi.fn(),
    setTheme: vi.fn(),
    theme: 'light',
  }),
}));
vi.mock('@/renderer/hooks/system/useExtensionSettingsTabs', () => ({
  useExtensionSettingsTabs: mocks.extensionTabs,
}));
vi.mock('@/renderer/hooks/system/useExtI18n', () => ({
  useExtI18n: mocks.extensionTranslations,
}));
vi.mock('@/common/config/configService', () => ({
  configService: { get: mocks.configGet, set: vi.fn() },
}));
vi.mock('@/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common')>();
  return {
    ...actual,
    ipcBridge: {
      ...actual.ipcBridge,
      extensions: {
        ...actual.ipcBridge.extensions,
        getThemes: { ...actual.ipcBridge.extensions.getThemes, invoke: mocks.extensionThemes },
      },
    },
  };
});
vi.mock('@/common/adapter/ipcBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/adapter/ipcBridge')>();
  return {
    ...actual,
    webui: {
      ...actual.webui,
      getStatus: { ...actual.webui.getStatus, invoke: mocks.webuiGetStatus },
      statusChanged: { ...actual.webui.statusChanged, on: mocks.webuiStatusChanged },
    },
  };
});
vi.mock('@/renderer/pages/ki-buddy', () => ({
  loadKiBuddyAccountSettings: async () => ({ default: () => <div>account-settings-page</div> }),
  loadKiBuddyLoginPage: async () => ({ default: () => <div>login-page</div> }),
  loadKiBuddyStartupGate: async () => ({
    default: ({ children }: React.PropsWithChildren) => <>{children}</>,
  }),
}));
vi.mock('@renderer/pages/guid', () => ({ default: () => <div>guid-page</div> }));
vi.mock('@renderer/pages/conversation', () => ({ default: () => <div>conversation-page</div> }));
vi.mock('@renderer/pages/team', () => ({ default: () => <div>team-page</div> }));
vi.mock('@renderer/pages/settings/AgentSettings', () => ({ default: () => <div>agent-settings-page</div> }));
vi.mock('@renderer/pages/settings/AgentSettings/AgentRepairPage', () => ({
  default: () => <div>agent-repair-page</div>,
}));
vi.mock('@renderer/pages/settings/AssistantSettings', () => ({
  default: () => {
    mocks.assistantPageRender();
    return <div>assistant-settings-page</div>;
  },
}));
vi.mock('@renderer/pages/settings/SkillsSettings/SkillsHubSettings', () => ({
  default: () => <div>skills-settings-page</div>,
}));
vi.mock('@renderer/pages/settings/SkillsSettings/SkillDetailPage', () => ({
  default: () => <div>skill-detail-page</div>,
}));
vi.mock('@renderer/pages/settings/ToolsSettings', () => ({ default: () => <div>tools-settings-page</div> }));
vi.mock('@renderer/pages/settings/AppearanceSettings', () => ({
  default: () => <div>appearance-settings-page</div>,
}));
vi.mock('@renderer/pages/settings/ModeSettings', () => ({ default: () => <div>model-settings-page</div> }));
vi.mock('@renderer/pages/settings/SystemSettings', () => ({ default: () => <div>system-settings-page</div> }));
vi.mock('@renderer/pages/settings/WebuiSettings', () => ({
  default: () => {
    mocks.webuiPageRender();
    return <div>webui-settings-page</div>;
  },
}));
vi.mock('@renderer/pages/settings/PetSettings', () => ({
  default: () => {
    mocks.petPageRender();
    return <div>pet-settings-page</div>;
  },
}));
vi.mock('@renderer/pages/settings/ExtensionSettingsPage', () => ({
  default: () => {
    mocks.extensionPageRender();
    return <div>extension-settings-page</div>;
  },
}));
vi.mock('@renderer/pages/TestShowcase', () => ({
  default: () => {
    mocks.showcasePageRender();
    return <div>showcase-page</div>;
  },
}));
vi.mock('@renderer/pages/cron/ScheduledTasksPage', () => ({ default: () => <div>scheduled-page</div> }));
vi.mock('@renderer/pages/cron/ScheduledTasksPage/TaskDetailPage', () => ({
  default: () => <div>scheduled-detail-page</div>,
}));
vi.mock('@renderer/pages/settings/AppearanceSettings/CssThemeSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@renderer/pages/settings/AppearanceSettings/CssThemeSettings')>();
  return {
    ...actual,
    default: (props: React.ComponentProps<typeof actual.default>) => {
      mocks.themeSettingsRender();
      const CssThemeSettings = actual.default;
      return (
        <>
          <div>theme-settings</div>
          <CssThemeSettings {...props} />
        </>
      );
    },
  };
});
vi.mock('@/renderer/components/settings/FontSizeStepper', () => ({
  default: () => <div data-testid='font-size-setting' />,
}));
vi.mock('@/renderer/components/settings/ScaleControl', () => ({
  default: () => <div data-testid='scale-setting' />,
}));

import PanelRoute from '@/renderer/components/layout/Router';
import SiderFooter from '@/renderer/components/layout/Sider/SiderFooter';
import AppearanceModalContent from '@/renderer/components/settings/SettingsModal/contents/AppearanceModalContent';
import CssThemeSettings from '@/renderer/pages/settings/AppearanceSettings/CssThemeSettings';
import SettingsPageWrapper from '@/renderer/pages/settings/components/SettingsPageWrapper';
import SettingsSider from '@/renderer/pages/settings/components/SettingsSider';
import QuickActionButtons from '@/renderer/pages/guid/components/QuickActionButtons';

const TestLayout = () => (
  <div>
    app-layout
    <Outlet />
  </div>
);

function activateKiBuddy(): void {
  window.electronAPI = {
    ...window.electronAPI,
    kiBuddyAuth: {
      getSession: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    },
  };
  window.__kiBuddyProductBootstrapError = null;
  activateKiBuddyProduct();
}

beforeEach(() => {
  mocks.authStatus = 'authenticated';
});

describe('Product experience settings navigation', () => {
  beforeEach(() => {
    mocks.isMobile = false;
    mocks.extensionTabs.mockClear();
    mocks.extensionTranslations.mockClear();
    window.__kiBuddyProductBootstrapError = null;
    window.__kiBuddyProductPresentation = null;
  });

  it('does not start Extension settings hooks from the Ki-Buddy mobile navigation', () => {
    activateKiBuddy();
    mocks.isMobile = true;

    render(
      <MemoryRouter initialEntries={['/settings/account']}>
        <SettingsPageWrapper>account-content</SettingsPageWrapper>
      </MemoryRouter>
    );

    expect(screen.getByText('account-content')).toBeInTheDocument();
    expect(mocks.extensionTabs).not.toHaveBeenCalled();
    expect(mocks.extensionTranslations).not.toHaveBeenCalled();
  });

  it('shows the Ki-Buddy settings in registry order without starting Extension settings subscriptions', () => {
    activateKiBuddy();

    const { container } = render(
      <MemoryRouter initialEntries={['/settings/account']}>
        <SettingsSider />
      </MemoryRouter>
    );

    const ids = Array.from(container.querySelectorAll('[data-settings-id]')).map((item) =>
      item.getAttribute('data-settings-id')
    );
    expect(ids).toEqual(['account', 'agent', 'model', 'skills', 'tools', 'appearance', 'system', 'about']);
    expect(mocks.extensionTabs).not.toHaveBeenCalled();
    expect(mocks.extensionTranslations).not.toHaveBeenCalled();
  });

  it('keeps the complete AionUi settings registry available', () => {
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth: undefined };

    const { container } = render(
      <MemoryRouter initialEntries={['/settings/agent']}>
        <SettingsSider />
      </MemoryRouter>
    );

    const ids = Array.from(container.querySelectorAll('[data-settings-id]')).map((item) =>
      item.getAttribute('data-settings-id')
    );
    expect(ids).toEqual(['agent', 'model', 'skills', 'tools', 'appearance', 'webui', 'pet', 'system', 'about']);
    expect(mocks.extensionTabs).toHaveBeenCalledOnce();
  });
});

describe('Product experience settings routes', () => {
  beforeEach(() => {
    mocks.assistantPageRender.mockClear();
    mocks.extensionPageRender.mockClear();
    mocks.petPageRender.mockClear();
    mocks.showcasePageRender.mockClear();
    mocks.webuiPageRender.mockClear();
    window.location.hash = '#/guid';
    window.__kiBuddyProductBootstrapError = null;
    window.__kiBuddyProductPresentation = null;
  });

  it('opens the first enabled registry page from the Ki-Buddy settings root', async () => {
    activateKiBuddy();
    window.location.hash = '#/settings';

    render(<PanelRoute layout={<TestLayout />} />);

    expect(await screen.findByText('account-settings-page')).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#/settings/account'));
  });

  it.each(['/settings/webui', '/settings/pet', '/settings/ext/marketplace'])(
    'replaces disabled address %s without mounting its page',
    async (path) => {
      activateKiBuddy();
      window.location.hash = `#${path}`;

      render(<PanelRoute layout={<TestLayout />} />);

      expect(await screen.findByText('account-settings-page')).toBeInTheDocument();
      await waitFor(() => expect(window.location.hash).toBe('#/settings/account'));
      expect(mocks.webuiPageRender).not.toHaveBeenCalled();
      expect(mocks.petPageRender).not.toHaveBeenCalled();
      expect(mocks.extensionPageRender).not.toHaveBeenCalled();
    }
  );

  it('keeps AionUi settings routes registered', async () => {
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth: undefined };
    window.location.hash = '#/settings/webui';

    render(<PanelRoute layout={<TestLayout />} />);

    expect(await screen.findByText('webui-settings-page')).toBeInTheDocument();
    expect(mocks.webuiPageRender).toHaveBeenCalled();
  });

  it.each([
    ['/guid', 'guid-page'],
    ['/conversation/conversation-1', 'conversation-page'],
    ['/assistants', 'assistant-settings-page'],
    ['/scheduled', 'scheduled-page'],
    ['/scheduled/job-1', 'scheduled-detail-page'],
  ])('keeps enabled Ki-Buddy workspace route %s available on direct refresh', async (path, pageText) => {
    activateKiBuddy();
    window.location.hash = `#${path}`;

    render(<PanelRoute layout={<TestLayout />} />);

    expect(await screen.findByText(pageText)).toBeInTheDocument();
    expect(window.location.hash).toBe(`#${path}`);
  });

  it('replaces the Assistants legacy address with the enabled workspace page', async () => {
    activateKiBuddy();
    window.location.hash = '#/settings/assistants';
    const replaceState = vi.spyOn(window.history, 'replaceState');

    render(<PanelRoute layout={<TestLayout />} />);

    expect(await screen.findByText('assistant-settings-page')).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#/assistants'));
    expect(mocks.assistantPageRender).toHaveBeenCalled();
    expect(replaceState.mock.calls.some(([, , url]) => String(url).endsWith('#/assistants'))).toBe(true);
    replaceState.mockRestore();
  });

  it.each([
    ['/conversation/conversation-1', { conversation: 'disabled' as const }],
    ['/assistants', { assistants: 'disabled' as const }],
    ['/scheduled', { scheduledTasks: 'disabled' as const }],
  ])('does not register disabled workspace route %s', async (path, featureOverrides) => {
    activateKiBuddy();
    activateKiBuddyProduct(featureOverrides);
    window.location.hash = `#${path}`;

    render(<PanelRoute layout={<TestLayout />} />);

    expect(await screen.findByText('guid-page')).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe('#/guid'));
  });

  it.each([
    ['authenticated' as const, 'guid-page', '#/guid'],
    ['unauthenticated' as const, 'login-page', '#/login'],
  ])('replaces the disabled Assistants legacy address for an %s user', async (authStatus, pageText, expectedHash) => {
    activateKiBuddy();
    activateKiBuddyProduct({ assistants: 'disabled' });
    mocks.authStatus = authStatus;
    window.location.hash = '#/settings/assistants';
    const replaceState = vi.spyOn(window.history, 'replaceState');

    render(<PanelRoute layout={<TestLayout />} />);

    expect(await screen.findByText(pageText)).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe(expectedHash));
    expect(mocks.assistantPageRender).not.toHaveBeenCalled();
    expect(replaceState.mock.calls.some(([, , url]) => String(url).endsWith(expectedHash))).toBe(true);
    replaceState.mockRestore();
  });

  it.each([
    ['authenticated' as const, 'guid-page', '#/guid'],
    ['unauthenticated' as const, 'login-page', '#/login'],
  ])('replaces a disabled showcase address for an %s user', async (authStatus, pageText, expectedHash) => {
    activateKiBuddy();
    mocks.authStatus = authStatus;
    window.location.hash = '#/test/components';
    const replaceState = vi.spyOn(window.history, 'replaceState');

    render(<PanelRoute layout={<TestLayout />} />);

    expect(await screen.findByText(pageText)).toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe(expectedHash));
    expect(replaceState.mock.calls.some(([, , url]) => String(url).endsWith(expectedHash))).toBe(true);
    expect(mocks.showcasePageRender).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });

  it('keeps the AionUi showcase route registered', async () => {
    window.electronAPI = { ...window.electronAPI, kiBuddyAuth: undefined };
    window.location.hash = '#/test/components';

    render(<PanelRoute layout={<TestLayout />} />);

    expect(await screen.findByText('showcase-page')).toBeInTheDocument();
    expect(mocks.showcasePageRender).toHaveBeenCalled();
  });
});

describe('Product experience Appearance projection', () => {
  beforeEach(() => {
    mocks.configGet.mockClear();
    mocks.extensionThemes.mockClear();
    mocks.themeSettingsRender.mockClear();
    window.__kiBuddyProductBootstrapError = null;
    window.__kiBuddyProductPresentation = null;
  });

  it('keeps font and UI scale without mounting disabled theme capabilities in Ki-Buddy', () => {
    activateKiBuddy();

    render(<AppearanceModalContent />);

    expect(screen.getAllByTestId('font-size-setting')).toHaveLength(3);
    expect(screen.getByTestId('scale-setting')).toBeInTheDocument();
    expect(screen.queryByText('theme-settings')).not.toBeInTheDocument();
    expect(mocks.themeSettingsRender).not.toHaveBeenCalled();
  });

  it('keeps the AionUi theme settings available', () => {
    render(<AppearanceModalContent />);

    expect(screen.getByText('theme-settings')).toBeInTheDocument();
    expect(mocks.themeSettingsRender).toHaveBeenCalledOnce();
  });

  it('does not read user or Extension themes when every theme capability is disabled', () => {
    render(<CssThemeSettings capabilities={{ customThemes: false, marketplace: false, presets: false }} />);

    expect(mocks.configGet).not.toHaveBeenCalled();
    expect(mocks.extensionThemes).not.toHaveBeenCalled();
    expect(screen.queryByText('settings.cssTheme.addManually')).not.toBeInTheDocument();
  });

  it('keeps AionUi user themes, Extension themes, and presets enabled', async () => {
    render(<CssThemeSettings capabilities={{ customThemes: true, marketplace: true, presets: true }} />);

    await waitFor(() => expect(mocks.extensionThemes).toHaveBeenCalledOnce());
    expect(mocks.configGet).toHaveBeenCalledWith('theme.userThemes');
    expect(screen.getByText('settings.cssTheme.addManually')).toBeInTheDocument();
  });

  it('keeps the quick light and dark mode control available in Ki-Buddy', () => {
    activateKiBuddy();
    const onThemeToggle = vi.fn();

    render(
      <SiderFooter
        isMobile={false}
        isSettings
        theme='light'
        siderTooltipProps={{}}
        onSettingsClick={vi.fn()}
        onThemeToggle={onThemeToggle}
      />
    );
    fireEvent.click(screen.getByLabelText('settings.darkMode'));

    expect(onThemeToggle).toHaveBeenCalledOnce();
  });
});

describe('Product experience Guid WebUI projection', () => {
  beforeEach(() => {
    mocks.webuiGetStatus.mockClear();
    mocks.webuiStatusChanged.mockClear();
    window.__kiBuddyProductBootstrapError = null;
    window.__kiBuddyProductPresentation = null;
  });

  it('does not render Guid feedback, GitHub star, or WebUI actions in Ki-Buddy', () => {
    activateKiBuddy();

    render(
      <MemoryRouter>
        <QuickActionButtons
          activeShadow='none'
          inactiveBorderColor='transparent'
          onOpenBugReport={vi.fn()}
          onOpenLink={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText('conversation.welcome.quickActionFeedback')).not.toBeInTheDocument();
    expect(screen.queryByText('conversation.welcome.quickActionStar')).not.toBeInTheDocument();
    expect(screen.queryByText(/settings\.webui ·/)).not.toBeInTheDocument();
    expect(mocks.webuiGetStatus).not.toHaveBeenCalled();
    expect(mocks.webuiStatusChanged).not.toHaveBeenCalled();
  });

  it('keeps all AionUi Guid quick actions and WebUI status behavior', async () => {
    render(
      <MemoryRouter>
        <QuickActionButtons
          activeShadow='none'
          inactiveBorderColor='transparent'
          onOpenBugReport={vi.fn()}
          onOpenLink={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('conversation.welcome.quickActionFeedback')).toBeInTheDocument();
    expect(screen.getByText('conversation.welcome.quickActionStar')).toBeInTheDocument();
    expect(await screen.findByText(/settings\.webui ·/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.webuiGetStatus).toHaveBeenCalledOnce());
    expect(mocks.webuiStatusChanged).toHaveBeenCalledOnce();
  });

  it.each([
    {
      disabledFeature: 'guidFeedback',
      featureOverrides: {
        guidFeedback: 'disabled',
        guidGithubStar: 'enabled',
        guidWebUi: 'enabled',
        webUi: 'enabled',
      },
      feedbackVisible: false,
      githubStarVisible: true,
      webUiVisible: true,
    },
    {
      disabledFeature: 'guidGithubStar',
      featureOverrides: {
        guidFeedback: 'enabled',
        guidGithubStar: 'disabled',
        guidWebUi: 'enabled',
        webUi: 'enabled',
      },
      feedbackVisible: true,
      githubStarVisible: false,
      webUiVisible: true,
    },
    {
      disabledFeature: 'guidWebUi',
      featureOverrides: {
        guidFeedback: 'enabled',
        guidGithubStar: 'enabled',
        guidWebUi: 'disabled',
      },
      feedbackVisible: true,
      githubStarVisible: true,
      webUiVisible: false,
    },
  ] as const)(
    'projects $disabledFeature independently from the other Guid quick actions',
    async ({ featureOverrides, feedbackVisible, githubStarVisible, webUiVisible }) => {
      activateKiBuddy();
      activateKiBuddyProduct(featureOverrides);

      render(
        <MemoryRouter>
          <QuickActionButtons
            activeShadow='none'
            inactiveBorderColor='transparent'
            onOpenBugReport={vi.fn()}
            onOpenLink={vi.fn()}
          />
        </MemoryRouter>
      );

      const feedback = screen.queryByText('conversation.welcome.quickActionFeedback');
      const githubStar = screen.queryByText('conversation.welcome.quickActionStar');
      if (feedbackVisible) expect(feedback).toBeInTheDocument();
      else expect(feedback).not.toBeInTheDocument();
      if (githubStarVisible) expect(githubStar).toBeInTheDocument();
      else expect(githubStar).not.toBeInTheDocument();

      if (webUiVisible) {
        expect(await screen.findByText(/settings\.webui ·/)).toBeInTheDocument();
        await waitFor(() => expect(mocks.webuiStatusChanged).toHaveBeenCalledOnce());
      } else {
        expect(screen.queryByText(/settings\.webui ·/)).not.toBeInTheDocument();
        expect(mocks.webuiGetStatus).not.toHaveBeenCalled();
        expect(mocks.webuiStatusChanged).not.toHaveBeenCalled();
      }
    }
  );
});
