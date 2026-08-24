import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAgentsMcpRuntimeBridge } from '@/process/ki-buddy/agents';
import type { AgentsInvokeRequest, startAgentsMcpBridge } from '@/process/ki-buddy/agents/bridge';
import { AgentsMcpError } from '@/process/ki-buddy/agents/errors';

const originalBridgeUrl = process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL;
const originalBridgeToken = process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN;
const clientId = '11111111-1111-4111-8111-111111111111';

type RuntimeAuthService = Parameters<typeof startAgentsMcpRuntimeBridge>[0];
type BridgeOptions = Parameters<typeof startAgentsMcpBridge>[0];

const createAuthService = (
  fetchAuthenticated: RuntimeAuthService['fetchAuthenticated'],
  sessionEpoch = 1
): RuntimeAuthService => ({
  fetchAuthenticated,
  getSessionEpoch: vi.fn(() => sessionEpoch),
});

const createStartBridgeCapture = () => {
  let options: BridgeOptions | undefined;
  const close = vi.fn().mockResolvedValue(undefined);
  const startBridge = vi.fn<typeof startAgentsMcpBridge>(async (candidate) => {
    options = candidate;
    return { url: 'http://127.0.0.1:43123', token: 'bridge-secret', close };
  });

  return {
    close,
    startBridge,
    options: (): BridgeOptions => {
      if (!options) throw new Error('Expected the runtime to configure the Agents MCP Bridge');
      return options;
    },
  };
};

afterEach(() => {
  if (originalBridgeUrl === undefined) delete process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL;
  else process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL = originalBridgeUrl;
  if (originalBridgeToken === undefined) delete process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN;
  else process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN = originalBridgeToken;
});

describe('startAgentsMcpRuntimeBridge', () => {
  it('publishes only ephemeral loopback bridge coordinates for the Core child', async () => {
    const bridge = createStartBridgeCapture();
    const handle = await startAgentsMcpRuntimeBridge(createAuthService(vi.fn()), process.env, bridge.startBridge);

    expect(process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL).toBe('http://127.0.0.1:43123');
    expect(process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN).toBe('bridge-secret');
    expect(JSON.stringify(process.env)).not.toContain('AGENTS_BASE_URL');

    await handle.close();
    expect(bridge.close).toHaveBeenCalledOnce();
    expect(process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL).toBeUndefined();
    expect(process.env.KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN).toBeUndefined();
  });

  it('uses the authenticated main-process boundary for catalog access', async () => {
    const response = Response.json({ status: 'ok', total: 0, agents: [] });
    const fetchAuthenticated = vi.fn().mockResolvedValue(response);
    const bridge = createStartBridgeCapture();
    const handle = await startAgentsMcpRuntimeBridge(
      createAuthService(fetchAuthenticated),
      process.env,
      bridge.startBridge
    );
    const signal = new AbortController().signal;

    await expect(bridge.options().fetchCatalog(clientId, signal)).resolves.toEqual({
      response,
      sessionEpoch: 1,
    });
    expect(fetchAuthenticated).toHaveBeenCalledWith('/bridge/agents/catalog', {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'x-ki-buddy-agents-client-id': clientId,
      },
      signal,
    });
    await handle.close();
  });

  it('posts only the validated invoke projection through the authenticated boundary', async () => {
    const response = Response.json({ status: 'completed' });
    const fetchAuthenticated = vi.fn().mockResolvedValue(response);
    const bridge = createStartBridgeCapture();
    const handle = await startAgentsMcpRuntimeBridge(
      createAuthService(fetchAuthenticated),
      process.env,
      bridge.startBridge
    );
    const signal = new AbortController().signal;
    const request: AgentsInvokeRequest = {
      agentId: 'agent-1',
      agentType: 'workflow',
      conversationId: 'ki-buddy-request-1',
      inputs: { query: 'Summary' },
    };

    await expect(bridge.options().invokeAgent(request, 1, clientId, signal)).resolves.toBe(response);
    expect(fetchAuthenticated).toHaveBeenCalledWith('/bridge/agents/invoke', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-ki-buddy-agents-client-id': clientId,
      },
      body: JSON.stringify(request),
      signal,
    });
    await handle.close();
  });

  it('streams multipart file content through the authenticated upload boundary', async () => {
    const response = Response.json({
      errorCode: 0,
      responseBody: { fileUrl: 'https://agents.example.test/files/remote-1' },
    });
    const fetchAuthenticated = vi.fn().mockResolvedValue(response);
    const bridge = createStartBridgeCapture();
    const handle = await startAgentsMcpRuntimeBridge(
      createAuthService(fetchAuthenticated),
      process.env,
      bridge.startBridge
    );
    const body = Readable.from(['multipart-body']) as IncomingMessage;
    const signal = new AbortController().signal;

    await expect(
      bridge.options().uploadFile?.(body, 'multipart/form-data; boundary=boundary-1', 1, clientId, signal)
    ).resolves.toEqual({ fileUrl: 'https://agents.example.test/files/remote-1', sessionEpoch: 1 });
    expect(fetchAuthenticated).toHaveBeenCalledWith(
      '/kagent/sys/file/upload',
      expect.objectContaining({
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'multipart/form-data; boundary=boundary-1',
          'x-ki-buddy-agents-client-id': clientId,
        },
        body: expect.any(ReadableStream),
        duplex: 'half',
        signal,
      })
    );
    await handle.close();
  });

  it('rejects invoke before dispatch when the main-process session changed', async () => {
    const fetchAuthenticated = vi.fn();
    const bridge = createStartBridgeCapture();
    const handle = await startAgentsMcpRuntimeBridge(
      createAuthService(fetchAuthenticated, 2),
      process.env,
      bridge.startBridge
    );

    await expect(
      bridge
        .options()
        .invokeAgent(
          { agentId: 'agent-1', agentType: 'workflow', conversationId: 'request-1', inputs: {} },
          1,
          clientId,
          new AbortController().signal
        )
    ).rejects.toMatchObject({ code: 'auth' });
    expect(fetchAuthenticated).not.toHaveBeenCalled();
    await handle.close();
  });

  it('classifies catalog transport failure as network', async () => {
    const bridge = createStartBridgeCapture();
    const handle = await startAgentsMcpRuntimeBridge(
      createAuthService(vi.fn().mockRejectedValue(new Error('private detail'))),
      process.env,
      bridge.startBridge
    );

    await expect(bridge.options().fetchCatalog(clientId, new AbortController().signal)).rejects.toMatchObject({
      code: 'network',
    });
    await handle.close();
  });

  it('classifies invoke transport loss after dispatch as result unknown', async () => {
    const bridge = createStartBridgeCapture();
    const handle = await startAgentsMcpRuntimeBridge(
      createAuthService(vi.fn().mockRejectedValue(new Error('socket closed'))),
      process.env,
      bridge.startBridge
    );

    await expect(
      bridge
        .options()
        .invokeAgent(
          { agentId: 'agent-1', agentType: 'workflow', conversationId: 'request-1', inputs: {} },
          1,
          clientId,
          new AbortController().signal
        )
    ).rejects.toMatchObject({
      code: 'result_unknown',
      correlation: { agentId: 'agent-1' },
    });
    await handle.close();
  });

  it('preserves an error already classified by the authenticated boundary', async () => {
    const classified = new AgentsMcpError('auth', 'Agents login is required');
    const bridge = createStartBridgeCapture();
    const handle = await startAgentsMcpRuntimeBridge(
      createAuthService(vi.fn().mockRejectedValue(classified)),
      process.env,
      bridge.startBridge
    );

    await expect(bridge.options().fetchCatalog(clientId, new AbortController().signal)).rejects.toBe(classified);
    await handle.close();
  });
});
