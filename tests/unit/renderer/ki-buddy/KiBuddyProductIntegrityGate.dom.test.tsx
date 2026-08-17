import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const { loadProductBuiltinMcpResourceStateMock } = vi.hoisted(() => ({
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

import KiBuddyProductIntegrityGate, {
  KiBuddyMcpProductIntegrityGate,
} from '@/renderer/pages/ki-buddy/KiBuddyProductIntegrityGate';

beforeEach(() => {
  vi.clearAllMocks();
  loadProductBuiltinMcpResourceStateMock.mockResolvedValue({ status: 'ready', missing: [] });
});

it('shows an installation-integrity error instead of AionUi business content for an invalid Ki-Buddy policy', () => {
  render(<KiBuddyProductIntegrityGate failure='Product experience features has invalid fields: missing team' />);

  expect(screen.getByText('login.kiBuddy.productExperience.invalidPolicyDescription')).toBeInTheDocument();
  expect(screen.queryByText('AionUi business content')).not.toBeInTheDocument();
});

it('does not load the MCP catalog outside the authenticated Ki-Buddy product path', () => {
  render(
    <KiBuddyMcpProductIntegrityGate enabled={false}>
      <div>AionUi business content</div>
    </KiBuddyMcpProductIntegrityGate>
  );

  expect(screen.getByText('AionUi business content')).toBeInTheDocument();
  expect(loadProductBuiltinMcpResourceStateMock).not.toHaveBeenCalled();
});

it('keeps business content available when registered product MCP resources are present', async () => {
  render(
    <KiBuddyMcpProductIntegrityGate enabled>
      <div>Ki-Buddy business content</div>
    </KiBuddyMcpProductIntegrityGate>
  );

  await waitFor(() => expect(loadProductBuiltinMcpResourceStateMock).toHaveBeenCalledOnce());
  expect(screen.getByText('Ki-Buddy business content')).toBeInTheDocument();
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
    <KiBuddyMcpProductIntegrityGate enabled>
      <div>Ki-Buddy business content</div>
    </KiBuddyMcpProductIntegrityGate>
  );

  expect(
    await screen.findByText('common.backendStartup.incompleteInstallation.runtimeComponentDescription:Agents Adapter')
  ).toBeInTheDocument();
  expect(screen.getByText('agents-adapter')).toBeInTheDocument();
  expect(screen.getByText('closable integrity notice')).toBeInTheDocument();
  expect(screen.getByText('Ki-Buddy business content')).toBeInTheDocument();
});

it('does not misreport an installation failure when catalog loading throws', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  loadProductBuiltinMcpResourceStateMock.mockRejectedValue(new Error('catalog unavailable'));

  render(
    <KiBuddyMcpProductIntegrityGate enabled>
      <div>Ki-Buddy business content</div>
    </KiBuddyMcpProductIntegrityGate>
  );

  await waitFor(() => expect(consoleError).toHaveBeenCalled());
  expect(screen.getByText('Ki-Buddy business content')).toBeInTheDocument();
  consoleError.mockRestore();
});
