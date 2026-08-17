import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { IProvider } from '@/common/config/storage';

const { mocks, provider } = vi.hoisted(() => ({
  mocks: {
    addModelOpen: vi.fn(),
    addPlatformOpen: vi.fn(),
    deleteProvider: vi.fn(),
    editProviderOpen: vi.fn(),
    mutate: vi.fn(),
    updateProvider: vi.fn(),
  },
  provider: {
    id: 'provider-1',
    platform: 'openai',
    name: 'Primary Provider',
    base_url: 'https://example.invalid',
    api_key: 'secret',
    models: ['model-one'],
  } satisfies IProvider,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Popconfirm: ({ children, onOk }: { children: React.ReactNode; onOk?: () => void }) => (
      <span onClick={() => onOk?.()}>{children}</span>
    ),
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      checkProviderHealth: { invoke: vi.fn() },
    },
    mode: {
      createProvider: { invoke: vi.fn() },
      deleteProvider: { invoke: mocks.deleteProvider },
      listProviders: { invoke: vi.fn().mockResolvedValue([provider]) },
      updateProvider: { invoke: mocks.updateProvider },
    },
  },
}));

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useProvidersQuery: () => ({ data: [provider], mutate: mocks.mutate }),
}));

vi.mock('@/renderer/pages/settings/components/AddPlatformModal', () => ({
  default: {
    useModal: () => [{ open: mocks.addPlatformOpen, close: vi.fn() }, <div key='add-platform-modal' />],
  },
}));

vi.mock('@/renderer/pages/settings/components/AddModelModal', () => ({
  default: {
    useModal: () => [{ open: mocks.addModelOpen, close: vi.fn() }, <div key='add-model-modal' />],
  },
}));

vi.mock('@/renderer/pages/settings/components/EditModeModal', () => ({
  default: {
    useModal: () => [{ open: mocks.editProviderOpen, close: vi.fn() }, <div key='edit-provider-modal' />],
  },
}));

vi.mock('@/renderer/components/base/TalkToButlerButton', () => ({
  default: ({ onManual }: { onManual: () => void }) => (
    <button data-testid='add-provider' onClick={onManual}>
      add provider
    </button>
  ),
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
}));

vi.mock('@/renderer/hooks/system/useDeepLink', () => ({
  consumePendingDeepLink: () => null,
}));

vi.mock('@/renderer/services/runtime/productBrandRuntime', () => ({
  getProductDocumentationUrl: (url: string) => url,
}));

import ModelModalContent from '@/renderer/components/settings/SettingsModal/contents/ModelModalContent';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteProvider.mockResolvedValue(undefined);
  mocks.mutate.mockResolvedValue(undefined);
  mocks.updateProvider.mockResolvedValue(undefined);
});

const renderContent = () => render(<ModelModalContent />);

it('shows providers from the projected Model directory', () => {
  renderContent();

  expect(screen.getByText('Primary Provider')).toBeInTheDocument();
});

it('keeps provider creation available from the projected Model directory', () => {
  renderContent();

  fireEvent.click(screen.getByTestId('add-provider'));
  expect(mocks.addPlatformOpen).toHaveBeenCalledOnce();
});

it('keeps model creation available from the projected Model directory', () => {
  const { container } = render(<ModelModalContent />);

  const providerActions = container.querySelectorAll<HTMLButtonElement>('.model-provider-action-btn');
  expect(providerActions).toHaveLength(3);

  fireEvent.click(providerActions[0]);
  expect(mocks.addModelOpen).toHaveBeenCalledWith({ data: provider });
});

it('keeps provider editing available from the projected Model directory', () => {
  const { container } = renderContent();
  const providerActions = container.querySelectorAll<HTMLButtonElement>('.model-provider-action-btn');

  fireEvent.click(providerActions[2]);
  expect(mocks.editProviderOpen).toHaveBeenCalledWith({ data: provider });
});

it('keeps provider deletion available from the projected Model directory', async () => {
  const { container } = renderContent();
  const providerActions = container.querySelectorAll<HTMLButtonElement>('.model-provider-action-btn');

  fireEvent.click(providerActions[1]);
  await waitFor(() => expect(mocks.deleteProvider).toHaveBeenCalledWith({ id: provider.id }));
});

it('keeps model selection available from the projected Model directory', async () => {
  renderContent();

  const switches = screen.getAllByRole('switch');
  fireEvent.click(switches[0]);
  await waitFor(() =>
    expect(mocks.updateProvider).toHaveBeenCalledWith({
      id: provider.id,
      model_enabled: { 'model-one': false },
      platform: provider.platform,
      name: provider.name,
      base_url: provider.base_url,
      api_key: provider.api_key,
      models: provider.models,
    })
  );
});
