import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAgentsMcpBridge, type AgentsMcpBridgeHandle } from '@/process/ki-buddy/agents/bridge';
import {
  AGENTS_MCP_AGENT_ID_HEADER,
  AGENTS_MCP_FIELD_NAME_HEADER,
  AGENTS_MCP_FILE_NAME_HEADER,
  AGENTS_MCP_FILE_SIZE_HEADER,
} from '@/process/ki-buddy/agents/contracts';

const handles: AgentsMcpBridgeHandle[] = [];
const catalog = {
  status: 'ok',
  total: 1,
  agents: [
    {
      agentId: 'agent-1',
      agentTitle: 'Agent 1',
      agentType: 'workflow',
      defaultInputModes: [
        { name: 'query', description: 'Query', type: 'text', required: true },
        {
          name: 'source',
          description: 'Source file',
          type: 'file',
          required: false,
          allowed_file_types: ['txt'],
        },
      ],
      defaultOutputModes: [],
    },
  ],
};
const currentCatalog = () => ({ response: Response.json(catalog), sessionEpoch: 1 });

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
});

async function request(
  bridge: AgentsMcpBridgeHandle,
  path: '/catalog' | '/invoke',
  body?: unknown,
  clientId = '11111111-1111-4111-8111-111111111111'
) {
  return fetch(`${bridge.url}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${bridge.token}`,
      'x-ki-buddy-agents-client-id': clientId,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function upload(
  bridge: AgentsMcpBridgeHandle,
  fileName = 'feedback.txt',
  clientId = '11111111-1111-4111-8111-111111111111',
  fieldName = 'source'
) {
  const form = new FormData();
  form.append('file', new Blob(['customer feedback'], { type: 'text/plain' }), fileName);
  return fetch(`${bridge.url}/upload`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bridge.token}`,
      'x-ki-buddy-agents-client-id': clientId,
      [AGENTS_MCP_AGENT_ID_HEADER]: encodeURIComponent('agent-1'),
      [AGENTS_MCP_FIELD_NAME_HEADER]: encodeURIComponent(fieldName),
      [AGENTS_MCP_FILE_NAME_HEADER]: encodeURIComponent(fileName),
      [AGENTS_MCP_FILE_SIZE_HEADER]: '17',
    },
    body: form,
  });
}

describe('startAgentsMcpBridge', () => {
  it('serves the current authenticated catalog without exposing session identity', async () => {
    const fetchCatalog = vi.fn().mockImplementation(async () => currentCatalog());
    const bridge = await startAgentsMcpBridge({ fetchCatalog, token: 'bridge-secret' });
    handles.push(bridge);

    const response = await request(bridge, '/catalog');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(catalog);
    expect(fetchCatalog).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', expect.any(AbortSignal));
  });

  it('rejects requests without the exact Adapter token before remote access', async () => {
    const fetchCatalog = vi.fn();
    const bridge = await startAgentsMcpBridge({ fetchCatalog, token: 'bridge-secret' });
    handles.push(bridge);

    const response = await fetch(`${bridge.url}/catalog`, {
      headers: { authorization: 'Bearer wrong-secret' },
    });

    expect(response.status).toBe(401);
    expect(fetchCatalog).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-client-id'],
  ])('rejects a %s stdio client identity before remote access', async (_name, clientId) => {
    const fetchCatalog = vi.fn();
    const bridge = await startAgentsMcpBridge({ fetchCatalog, token: `bridge-secret-${_name}` });
    handles.push(bridge);

    const response = await fetch(`${bridge.url}/catalog`, {
      headers: {
        authorization: `Bearer ${bridge.token}`,
        ...(clientId ? { 'x-ki-buddy-agents-client-id': clientId } : {}),
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'agents_invalid_input' });
    expect(fetchCatalog).not.toHaveBeenCalled();
  });

  it.each([
    ['missing required input', {}],
    ['field outside schema', { query: 'Summary', apiKey: 'must-not-dispatch' }],
    ['non-scalar input', { query: { nested: true } }],
  ])('rejects %s against a freshly fetched schema before remote invoke', async (_name, inputs) => {
    const invokeAgent = vi.fn();
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async () => currentCatalog()),
      invokeAgent,
      token: `bridge-secret-${_name}`,
    });
    handles.push(bridge);

    const response = await request(bridge, '/invoke', { agentId: 'agent-1', inputs });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'agents_invalid_input' });
    expect(invokeAgent).not.toHaveBeenCalled();
  });

  it('dispatches after fresh catalog validation and forwards the complete successful JSON response', async () => {
    const upstreamResult = {
      state: 'submitted',
      authorization: 'business authorization value',
      headers: { source: 'business result' },
      debug: { trace: 'business result' },
      result: {
        token: 'business token',
        result_file: { name: 'statement.xlsx', path: '/remote/result/statement.xlsx' },
        outputs: [{ kind: 'table', rows: 12 }],
      },
    };
    const invokeAgent = vi.fn().mockResolvedValue(Response.json(upstreamResult));
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async () => currentCatalog()),
      invokeAgent,
      token: 'bridge-secret-invoke',
    });
    handles.push(bridge);

    const response = await request(bridge, '/invoke', {
      agentId: 'agent-1',
      inputs: { query: 'Summary' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(upstreamResult);
    expect(invokeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-1', agentType: 'workflow', inputs: { query: 'Summary' } }),
      1,
      '11111111-1111-4111-8111-111111111111',
      expect.any(AbortSignal)
    );
  });

  it('returns the remote file URL after upload validation', async () => {
    const uploadFile = vi.fn().mockResolvedValue({
      fileUrl: 'https://agents.example.test/files/remote-1',
      sessionEpoch: 1,
    });
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async () => currentCatalog()),
      uploadFile,
      token: 'bridge-secret-file',
    });
    handles.push(bridge);

    const uploadResponse = await upload(bridge);
    expect(uploadResponse.status).toBe(200);
    await expect(uploadResponse.json()).resolves.toEqual({
      fileUrl: 'https://agents.example.test/files/remote-1',
      fileName: 'feedback.txt',
      size: 17,
    });
    expect(uploadFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^multipart\/form-data; boundary=/u),
      1,
      '11111111-1111-4111-8111-111111111111',
      expect.any(AbortSignal)
    );
  });

  it('accepts a Unicode file field name within the decoded schema limit', async () => {
    const fieldName = '字段'.repeat(50);
    const unicodeCatalog = structuredClone(catalog);
    if (unicodeCatalog.agents[0]?.defaultInputModes[1]) {
      unicodeCatalog.agents[0].defaultInputModes[1].name = fieldName;
    }
    const uploadFile = vi.fn().mockResolvedValue({
      fileUrl: 'https://agents.example.test/files/remote-1',
      sessionEpoch: 1,
    });
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockResolvedValue({ response: Response.json(unicodeCatalog), sessionEpoch: 1 }),
      uploadFile,
      token: 'bridge-secret-unicode-field',
    });
    handles.push(bridge);

    const response = await upload(bridge, 'feedback.txt', '11111111-1111-4111-8111-111111111111', fieldName);

    expect(response.status).toBe(200);
    expect(uploadFile).toHaveBeenCalledOnce();
  });

  it('rejects a file type outside allowed_file_types before remote upload', async () => {
    const uploadFile = vi.fn();
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async () => currentCatalog()),
      uploadFile,
      token: 'bridge-secret-file-type',
    });
    handles.push(bridge);

    const response = await upload(bridge, 'feedback.pdf');

    expect(response.status).toBe(400);
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('does not check file format when the Agent schema omits allowed_file_types', async () => {
    const unrestrictedCatalog = structuredClone(catalog);
    delete unrestrictedCatalog.agents[0]?.defaultInputModes[1]?.allowed_file_types;
    const uploadFile = vi.fn().mockResolvedValue({
      fileUrl: 'https://agents.example.test/files/remote-1',
      sessionEpoch: 1,
    });
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockResolvedValue({ response: Response.json(unrestrictedCatalog), sessionEpoch: 1 }),
      uploadFile,
      token: 'bridge-secret-unrestricted-file-type',
    });
    handles.push(bridge);

    const response = await upload(bridge, 'feedback.proprietary');

    expect(response.status).toBe(200);
    expect(uploadFile).toHaveBeenCalledOnce();
  });

  it('keeps concurrent clients distinct across the shared loopback bridge', async () => {
    const clients: string[] = [];
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async (clientId: string) => {
        clients.push(clientId);
        return currentCatalog();
      }),
      token: 'bridge-secret-client-isolation',
    });
    handles.push(bridge);

    await Promise.all([
      request(bridge, '/catalog', undefined, '11111111-1111-4111-8111-111111111111'),
      request(bridge, '/catalog', undefined, '22222222-2222-4222-8222-222222222222'),
    ]);

    expect(clients.toSorted()).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('serves a concurrent catalog request while an invoke response is pending', async () => {
    let finishInvoke: ((response: Response) => void) | undefined;
    const invokeAgent = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finishInvoke = resolve;
        })
    );
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async () => currentCatalog()),
      invokeAgent,
      token: 'bridge-secret-concurrent',
    });
    handles.push(bridge);

    const invoke = request(bridge, '/invoke', { agentId: 'agent-1', inputs: { query: 'Summary' } });
    await vi.waitFor(() => expect(invokeAgent).toHaveBeenCalledOnce());

    const catalogResponse = await request(bridge, '/catalog');
    expect(catalogResponse.status).toBe(200);
    await expect(catalogResponse.json()).resolves.toEqual(catalog);

    finishInvoke?.(Response.json({ state: 'completed', result: { rows: [] } }));
    await expect(invoke.then((result) => result.json())).resolves.toEqual({ state: 'completed', result: { rows: [] } });
  });

  it('reports a transport loss after dispatch as result unknown', async () => {
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async () => currentCatalog()),
      invokeAgent: vi.fn().mockRejectedValue(new Error('socket closed after remote completion')),
      token: 'bridge-secret-result-unknown',
    });
    handles.push(bridge);

    const response = await request(bridge, '/invoke', {
      agentId: 'agent-1',
      inputs: { query: 'Summary' },
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'agents_result_unknown',
      correlation: { agentId: 'agent-1' },
    });
  });

  it('returns not found when the selected agent is absent from the fresh catalog', async () => {
    const invokeAgent = vi.fn();
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockResolvedValue({
        response: Response.json({ status: 'ok', total: 0, agents: [] }),
        sessionEpoch: 1,
      }),
      invokeAgent,
      token: 'bridge-secret-not-found',
    });
    handles.push(bridge);

    const response = await request(bridge, '/invoke', { agentId: 'agent-1', inputs: {} });

    expect(response.status).toBe(404);
    expect(invokeAgent).not.toHaveBeenCalled();
  });
});
