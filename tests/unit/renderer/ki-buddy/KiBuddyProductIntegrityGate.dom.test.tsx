import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  loadProductBuiltinAgentResourceStateMock,
  loadProductBuiltinAssistantResourceStateMock,
  loadProductBuiltinMcpResourceStateMock,
} = vi.hoisted(() => ({
  loadProductBuiltinAgentResourceStateMock: vi.fn(),
  loadProductBuiltinAssistantResourceStateMock: vi.fn(),
  loadProductBuiltinMcpResourceStateMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { resource?: string }) => (options?.resource ? `${key}:${options.resource}` : key),
  }),
}));
vi.mock('@/renderer/components/layout/InstallationIntegrityDialog', () => ({
  getRuntimeComponentInstallationDescription: (_t: unknown, resource: string) =>
    `common.backendStartup.incompleteInstallation.runtimeComponentDescription:${resource}`,
  InstallationIntegrityModalHost: ({
    closable,
    description,
    diagnostics,
  }: {
    closable?: boolean;
    description: string;
    diagnostics?: { runtime?: { resourceId?: string } };
  }) => (
    <div>
      <span>{description}</span>
      <span>{diagnostics?.runtime?.resourceId}</span>
      <span>{closable ? 'closable integrity notice' : 'blocking integrity notice'}</span>
    </div>
  ),
}));
vi.mock('@/renderer/hooks/mcp/catalog', () => ({
  loadProductBuiltinMcpResourceState: loadProductBuiltinMcpResourceStateMock,
}));
vi.mock('@/renderer/services/runtime/kiBuddyAgentCatalog', () => ({
  loadProductBuiltinAgentResourceState: loadProductBuiltinAgentResourceStateMock,
}));
vi.mock('@/renderer/services/runtime/catalogs/kiBuddyAssistantCatalog', () => ({
  loadProductBuiltinAssistantResourceState: loadProductBuiltinAssistantResourceStateMock,
}));

import KiBuddyProductIntegrityGate, {
  KiBuddyProductResourceIntegrityGate,
} from '@/renderer/pages/ki-buddy/KiBuddyProductIntegrityGate';

beforeEach(() => {
  vi.clearAllMocks();
  loadProductBuiltinAgentResourceStateMock.mockResolvedValue({ status: 'ready', missing: [] });
  loadProductBuiltinAssistantResourceStateMock.mockResolvedValue({ status: 'ready', missing: [] });
  loadProductBuiltinMcpResourceStateMock.mockResolvedValue({ status: 'ready', missing: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

it('shows an installation-integrity error instead of AionUi business content for an invalid Ki-Buddy policy', () => {
  render(<KiBuddyProductIntegrityGate failure='Product experience features has invalid fields: missing team' />);

  expect(screen.getByText('login.kiBuddy.productExperience.invalidPolicyDescription')).toBeInTheDocument();
  expect(screen.queryByText('AionUi business content')).not.toBeInTheDocument();
});

it('does not load the MCP catalog outside the authenticated Ki-Buddy product path', () => {
  render(
    <KiBuddyProductResourceIntegrityGate enabled={false}>
      <div>AionUi business content</div>
    </KiBuddyProductResourceIntegrityGate>
  );

  expect(screen.getByText('AionUi business content')).toBeInTheDocument();
  expect(loadProductBuiltinAgentResourceStateMock).not.toHaveBeenCalled();
  expect(loadProductBuiltinAssistantResourceStateMock).not.toHaveBeenCalled();
  expect(loadProductBuiltinMcpResourceStateMock).not.toHaveBeenCalled();
});

it('keeps business content available when registered product resources are present', async () => {
  render(
    <KiBuddyProductResourceIntegrityGate enabled>
      <div>Ki-Buddy business content</div>
    </KiBuddyProductResourceIntegrityGate>
  );

  await waitFor(() => expect(loadProductBuiltinAgentResourceStateMock).toHaveBeenCalledOnce());
  await waitFor(() => expect(loadProductBuiltinAssistantResourceStateMock).toHaveBeenCalledOnce());
  await waitFor(() => expect(loadProductBuiltinMcpResourceStateMock).toHaveBeenCalledOnce());
  expect(screen.getByText('Ki-Buddy business content')).toBeInTheDocument();
});

it('shows installation integrity diagnostics for a missing KiCLI while keeping Account content available', async () => {
  loadProductBuiltinAgentResourceStateMock.mockResolvedValue({
    status: 'invalid',
    missing: [
      {
        code: 'required_product_resource_missing',
        featureId: 'agents',
        kind: 'agent',
        origin: 'productBuiltin',
        resourceId: '632f31d2',
        resourceName: 'Ki CLI',
      },
    ],
  });

  render(
    <KiBuddyProductResourceIntegrityGate enabled>
      <div>Account and diagnostics content</div>
    </KiBuddyProductResourceIntegrityGate>
  );

  expect(
    await screen.findByText('common.backendStartup.incompleteInstallation.runtimeComponentDescription:Ki CLI')
  ).toBeInTheDocument();
  expect(screen.getByText('632f31d2')).toBeInTheDocument();
  expect(screen.getByText('closable integrity notice')).toBeInTheDocument();
  expect(screen.getByText('Account and diagnostics content')).toBeInTheDocument();
});

it('shows installation integrity diagnostics when a required product MCP is missing', async () => {
  loadProductBuiltinMcpResourceStateMock.mockResolvedValue({
    status: 'invalid',
    missing: [
      {
        code: 'required_product_resource_missing',
        featureId: 'agents',
        kind: 'mcp',
        origin: 'productBuiltin',
        resourceId: 'agents-adapter',
        resourceName: 'Agents Adapter',
      },
    ],
  });

  render(
    <KiBuddyProductResourceIntegrityGate enabled>
      <div>Ki-Buddy business content</div>
    </KiBuddyProductResourceIntegrityGate>
  );

  expect(
    await screen.findByText('common.backendStartup.incompleteInstallation.runtimeComponentDescription:Agents Adapter')
  ).toBeInTheDocument();
  expect(screen.getByText('agents-adapter')).toBeInTheDocument();
  expect(screen.getByText('closable integrity notice')).toBeInTheDocument();
  expect(screen.getByText('Ki-Buddy business content')).toBeInTheDocument();
});

it('waits for the post-auth Adapter registration before reporting it as missing', async () => {
  vi.useFakeTimers();
  loadProductBuiltinMcpResourceStateMock
    .mockResolvedValueOnce({
      status: 'invalid',
      missing: [
        {
          code: 'required_product_resource_missing',
          featureId: 'tools',
          kind: 'mcp',
          origin: 'productBuiltin',
          resourceId: 'builtin:agents-mcp-adapter',
          resourceName: 'agents-mcp-adapter',
        },
      ],
    })
    .mockResolvedValueOnce({ status: 'ready', missing: [] });

  render(
    <KiBuddyProductResourceIntegrityGate enabled>
      <div>Ki-Buddy business content</div>
    </KiBuddyProductResourceIntegrityGate>
  );

  await act(async () => Promise.resolve());
  expect(loadProductBuiltinMcpResourceStateMock).toHaveBeenCalledOnce();
  expect(
    screen.queryByText('common.backendStartup.incompleteInstallation.runtimeComponentDescription:agents-mcp-adapter')
  ).not.toBeInTheDocument();

  await act(async () => vi.advanceTimersByTimeAsync(1_000));

  expect(loadProductBuiltinMcpResourceStateMock).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Ki-Buddy business content')).toBeInTheDocument();
});

it('reports the Adapter as missing when registration stays absent through the grace period', async () => {
  vi.useFakeTimers();
  loadProductBuiltinMcpResourceStateMock.mockResolvedValue({
    status: 'invalid',
    missing: [
      {
        code: 'required_product_resource_missing',
        featureId: 'tools',
        kind: 'mcp',
        origin: 'productBuiltin',
        resourceId: 'builtin:agents-mcp-adapter',
        resourceName: 'agents-mcp-adapter',
      },
    ],
  });

  render(
    <KiBuddyProductResourceIntegrityGate enabled>
      <div>Account and diagnostics content</div>
    </KiBuddyProductResourceIntegrityGate>
  );

  await act(async () => Promise.resolve());
  expect(screen.queryByText('builtin:agents-mcp-adapter')).not.toBeInTheDocument();

  await act(async () => vi.advanceTimersByTimeAsync(15_000));

  expect(screen.getByText('builtin:agents-mcp-adapter')).toBeInTheDocument();
  expect(screen.getByText('Account and diagnostics content')).toBeInTheDocument();
});

it('shows installation integrity diagnostics when a required product Assistant is missing', async () => {
  loadProductBuiltinAssistantResourceStateMock.mockResolvedValue({
    status: 'invalid',
    missing: [
      {
        code: 'required_product_resource_missing',
        featureId: 'assistants',
        kind: 'assistant',
        origin: 'productBuiltin',
        resourceId: 'word-creator',
        resourceName: 'Word Creator',
      },
    ],
  });

  render(
    <KiBuddyProductResourceIntegrityGate enabled>
      <div>Account and diagnostics content</div>
    </KiBuddyProductResourceIntegrityGate>
  );

  expect(
    await screen.findByText('common.backendStartup.incompleteInstallation.runtimeComponentDescription:Word Creator')
  ).toBeInTheDocument();
  expect(screen.getByText('word-creator')).toBeInTheDocument();
  expect(screen.getByText('Account and diagnostics content')).toBeInTheDocument();
});

it('does not misreport an installation failure when catalog loading throws', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  loadProductBuiltinMcpResourceStateMock.mockRejectedValue(new Error('catalog unavailable'));

  render(
    <KiBuddyProductResourceIntegrityGate enabled>
      <div>Ki-Buddy business content</div>
    </KiBuddyProductResourceIntegrityGate>
  );

  await waitFor(() => expect(consoleError).toHaveBeenCalled());
  expect(screen.getByText('Ki-Buddy business content')).toBeInTheDocument();
  consoleError.mockRestore();
});

it('retries a pending Agent directory and reports a missing KiCLI after it becomes authoritative', async () => {
  vi.useFakeTimers();
  loadProductBuiltinAgentResourceStateMock
    .mockResolvedValueOnce({ status: 'pending', missing: [] })
    .mockResolvedValueOnce({
      status: 'invalid',
      missing: [
        {
          code: 'required_product_resource_missing',
          featureId: 'agents',
          kind: 'agent',
          origin: 'productBuiltin',
          resourceId: '632f31d2',
          resourceName: 'Ki CLI',
        },
      ],
    });

  render(
    <KiBuddyProductResourceIntegrityGate enabled>
      <div>Account and diagnostics content</div>
    </KiBuddyProductResourceIntegrityGate>
  );

  await act(async () => Promise.resolve());
  expect(loadProductBuiltinAgentResourceStateMock).toHaveBeenCalledOnce();

  await act(async () => vi.advanceTimersByTimeAsync(1_000));

  expect(loadProductBuiltinAgentResourceStateMock).toHaveBeenCalledTimes(2);
  expect(
    screen.getByText('common.backendStartup.incompleteInstallation.runtimeComponentDescription:Ki CLI')
  ).toBeInTheDocument();
});
