import { EventEmitter } from 'node:events';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { describe, expect, it, vi } from 'vitest';
import { AgentsMcpError } from '@/process/ki-buddy/agents/errors';
import { startAgentsMcpAdapter } from '@/process/ki-buddy/agents/server';

function createAdapterHarness() {
  const stdin = new EventEmitter();
  const processEvents = new EventEmitter();
  const connect = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  const server = { close, connect };
  const client = {};
  const transport = {};
  let parentPid = 42;
  let checkParent: (() => void) | undefined;
  const stopParentWatch = vi.fn();
  const runtimeProcess = {
    env: {
      KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL: 'http://127.0.0.1:43123',
      KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN: 'bridge-secret',
    },
    exitCode: undefined as number | undefined,
    get ppid() {
      return parentPid;
    },
    stdin,
    stderr: { write: vi.fn() },
    once: processEvents.once.bind(processEvents),
  };
  const createClient = vi.fn(() => client);
  const createClientId = vi.fn(() => '11111111-1111-4111-8111-111111111111');
  const createServer = vi.fn(() => server);
  const createTransport = vi.fn(() => transport);
  const watchParent = vi.fn((callback: () => void) => {
    checkParent = callback;
    return stopParentWatch;
  });

  return {
    checkParent: () => checkParent?.(),
    client,
    close,
    connect,
    createClient,
    createServer,
    createTransport,
    dependencies: { createClient, createClientId, createServer, createTransport, process: runtimeProcess, watchParent },
    processEvents,
    runtimeProcess,
    server,
    setParentPid: (value: number) => {
      parentPid = value;
    },
    stdin,
    stopParentWatch,
    transport,
  };
}

describe('startAgentsMcpAdapter', () => {
  it('connects the Agents MCP server to stdio with the current Bridge configuration', async () => {
    const harness = createAdapterHarness();

    await startAgentsMcpAdapter(harness.dependencies as never);

    expect(harness.createClient).toHaveBeenCalledWith({
      bridgeUrl: 'http://127.0.0.1:43123',
      bridgeToken: 'bridge-secret',
      clientId: '11111111-1111-4111-8111-111111111111',
    });
    expect(harness.createServer).toHaveBeenCalledWith(harness.client);
    expect(harness.connect).toHaveBeenCalledWith(harness.transport);
  });

  it('assigns a distinct client identity to every stdio process', async () => {
    const first = createAdapterHarness();
    const second = createAdapterHarness();
    first.dependencies.createClientId.mockReturnValue('11111111-1111-4111-8111-111111111111');
    second.dependencies.createClientId.mockReturnValue('22222222-2222-4222-8222-222222222222');

    await Promise.all([
      startAgentsMcpAdapter(first.dependencies as never),
      startAgentsMcpAdapter(second.dependencies as never),
    ]);

    expect(first.createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: '11111111-1111-4111-8111-111111111111',
      })
    );
    expect(second.createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: '22222222-2222-4222-8222-222222222222',
      })
    );
  });

  it('uses the production stdio transport and parent watcher by default', async () => {
    const harness = createAdapterHarness();

    await startAgentsMcpAdapter({
      createClient: harness.createClient,
      createServer: harness.createServer,
      process: harness.runtimeProcess,
    } as never);

    expect(harness.connect).toHaveBeenCalledWith(expect.any(StdioServerTransport));
    harness.stdin.emit('end');
    await vi.waitFor(() => expect(harness.close).toHaveBeenCalledOnce());
  });

  it('closes once when the MCP client ends stdin', async () => {
    const harness = createAdapterHarness();
    await startAgentsMcpAdapter(harness.dependencies as never);

    harness.stdin.emit('end');

    await vi.waitFor(() => expect(harness.close).toHaveBeenCalledOnce());
    expect(harness.stopParentWatch).toHaveBeenCalledOnce();
    expect(harness.runtimeProcess.exitCode).toBeUndefined();
  });

  it.each(['SIGINT', 'SIGTERM'] as const)('closes cleanly once after %s', async (signal) => {
    const harness = createAdapterHarness();
    await startAgentsMcpAdapter(harness.dependencies as never);

    harness.processEvents.emit(signal);
    harness.processEvents.emit(signal === 'SIGINT' ? 'SIGTERM' : 'SIGINT');

    await vi.waitFor(() => expect(harness.close).toHaveBeenCalledOnce());
    expect(harness.stopParentWatch).toHaveBeenCalledOnce();
    expect(harness.runtimeProcess.exitCode).toBe(0);
  });

  it('closes when the owning parent process changes while stdin remains open', async () => {
    const harness = createAdapterHarness();
    await startAgentsMcpAdapter(harness.dependencies as never);

    harness.checkParent();
    expect(harness.close).not.toHaveBeenCalled();
    harness.setParentPid(1);
    harness.checkParent();

    await vi.waitFor(() => expect(harness.close).toHaveBeenCalledOnce());
    expect(harness.runtimeProcess.exitCode).toBe(0);
  });

  it('reports a close failure without exposing Bridge configuration', async () => {
    const harness = createAdapterHarness();
    harness.close.mockRejectedValue(new Error('bridge-secret at http://127.0.0.1:43123'));
    await startAgentsMcpAdapter(harness.dependencies as never);

    harness.processEvents.emit('SIGTERM');

    await vi.waitFor(() => expect(harness.runtimeProcess.stderr.write).toHaveBeenCalledOnce());
    const diagnostic = String(harness.runtimeProcess.stderr.write.mock.calls[0]?.[0]);
    expect(diagnostic).toContain('"event":"server.close_failed"');
    expect(diagnostic).not.toMatch(/bridge-secret|127\.0\.0\.1/);
  });

  it('reports a safe classified diagnostic when Bridge configuration is invalid', async () => {
    const harness = createAdapterHarness();
    harness.createClient.mockImplementation(() => {
      throw new AgentsMcpError('configuration', 'bridge-secret');
    });

    await startAgentsMcpAdapter(harness.dependencies as never);

    expect(harness.runtimeProcess.exitCode).toBe(1);
    const diagnostic = String(harness.runtimeProcess.stderr.write.mock.calls[0]?.[0]);
    expect(diagnostic).toContain('"code":"configuration"');
    expect(diagnostic).not.toContain('bridge-secret');
  });

  it('classifies an unexpected startup failure as a server error', async () => {
    const harness = createAdapterHarness();
    harness.connect.mockRejectedValue(new Error('unexpected failure'));

    await startAgentsMcpAdapter(harness.dependencies as never);

    expect(harness.runtimeProcess.exitCode).toBe(1);
    expect(harness.runtimeProcess.stderr.write).toHaveBeenCalledWith(expect.stringContaining('"code":"server"'));
  });
});
