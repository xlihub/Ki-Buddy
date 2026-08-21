import { describe, expect, it, vi } from 'vitest';
import { createAgentsClient } from '@/process/ki-buddy/agents/client';

const validCatalog = {
  status: 'ok',
  total: 1,
  agents: [
    {
      agentId: 'agent-feedback',
      agentTitle: 'Feedback analyst',
      agentDescription: 'Summarizes customer feedback.',
      agentType: 'workflow',
      defaultInputModes: [{ name: 'query', description: 'Query', type: 'text', required: true }],
      defaultOutputModes: [{ name: 'summary', description: 'Summary', type: 'text', required: true }],
    },
  ],
};

const createClient = (fetchImpl: typeof fetch, timeoutMs?: number) =>
  createAgentsClient({
    bridgeUrl: 'http://127.0.0.1:43123',
    bridgeToken: 'bridge-secret',
    clientId: '11111111-1111-4111-8111-111111111111',
    fetchImpl,
    ...(timeoutMs ? { timeoutMs, invokeTimeoutMs: timeoutMs } : {}),
  });

describe('createAgentsClient', () => {
  it('loads a safe inventory directly from the authenticated loopback bridge', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(validCatalog)));
    const client = createClient(fetchMock);

    await expect(client.list()).resolves.toMatchObject({
      total: 1,
      agents: [{ agentId: 'agent-feedback', title: 'Feedback analyst' }],
    });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:43123/catalog', {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer bridge-secret',
        'x-ki-buddy-agents-client-id': '11111111-1111-4111-8111-111111111111',
      },
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
  });

  it('fetches the current catalog for every list and describe call without session cache state', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(validCatalog)));
    const client = createClient(fetchMock);

    await client.list();
    await client.list();
    await expect(client.describe('agent-feedback')).resolves.toMatchObject({
      agentId: 'agent-feedback',
      inputSchema: [{ name: 'query', type: 'text', required: true }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([input]) => new URL(String(input)).pathname === '/catalog')).toBe(true);
  });

  it('sends only the selected agent and scalar inputs to the loopback invoke endpoint', async () => {
    const remoteResult = {
      status: 'submitted',
      flow_instance_id: 'task-1',
      request_id: 'request-1',
      result: { result_file: { name: 'statement.xlsx' }, rows: [{ amount: 12.5 }] },
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(remoteResult));
    const client = createClient(fetchMock);

    await expect(client.invoke('agent-feedback', { query: 'Summarize this.' })).resolves.toEqual(remoteResult);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      agentId: 'agent-feedback',
      inputs: { query: 'Summarize this.' },
    });
  });

  it('does not require a fixed Bridge invoke result envelope', async () => {
    const result = ['remote', { nested: true }, 12];
    const client = createClient(vi.fn().mockResolvedValue(Response.json(result)));

    await expect(client.invoke('agent-feedback', {})).resolves.toEqual(result);
  });

  it('uses a short catalog timeout and a separate long invoke timeout by default', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const client = createClient(vi.fn().mockImplementation(() => Promise.resolve(Response.json(validCatalog))));

    await client.list();
    await client.invoke('agent-feedback', {});

    expect(timeout).toHaveBeenNthCalledWith(1, 30_000);
    expect(timeout).toHaveBeenNthCalledWith(2, 310_000);
    timeout.mockRestore();
  });

  it('reports a disconnected dispatched invoke as result unknown', async () => {
    let dispatched = false;
    const fetchMock = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          dispatched = true;
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        })
    );
    const client = createClient(fetchMock as typeof fetch, 1_000);

    await expect(client.invoke('agent-feedback', {})).rejects.toMatchObject({
      code: 'result_unknown',
      message: 'Agent execution result is unknown',
      correlation: { agentId: 'agent-feedback' },
    });
    expect(dispatched).toBe(true);
  });

  it('keeps only the dispatched agent identity from a sanitized Bridge failure', async () => {
    const client = createClient(
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: 'agents_result_unknown',
            correlation: { agentId: 'agent-feedback', requestId: 'request-1' },
          },
          { status: 502 }
        )
      )
    );

    const error = await client.invoke('agent-feedback', {}).catch((value: unknown) => value);

    expect(error).toMatchObject({ code: 'result_unknown' });
    expect((error as { correlation?: unknown }).correlation).toEqual({ agentId: 'agent-feedback' });
  });

  it.each([null, [], 'agent-feedback'])('rejects malformed invoke failure correlation %j', async (correlation) => {
    const client = createClient(
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: 'agents_result_unknown',
            correlation,
          },
          { status: 502 }
        )
      )
    );

    await expect(client.invoke('agent-feedback', {})).rejects.toMatchObject({
      code: 'contract',
      message: 'Agents invoke failure correlation is incompatible',
    });
  });

  it('rejects result-unknown invoke failure without correlation', async () => {
    const client = createClient(
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: 'agents_result_unknown',
          },
          { status: 502 }
        )
      )
    );

    await expect(client.invoke('agent-feedback', {})).rejects.toMatchObject({
      code: 'contract',
      message: 'Agents invoke failure correlation is incompatible',
    });
  });

  it('rejects invoke failure correlation for a different agent', async () => {
    const client = createClient(
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: 'agents_result_unknown',
            correlation: { agentId: 'another-agent' },
          },
          { status: 502 }
        )
      )
    );

    await expect(client.invoke('agent-feedback', {})).rejects.toMatchObject({
      code: 'contract',
      message: 'Agents invoke failure correlation is incompatible',
    });
  });

  it('maps catalog connection failure to network without exposing transport details', async () => {
    const client = createClient(vi.fn().mockRejectedValue(new Error('ECONNREFUSED token=secret')));

    await expect(client.list()).rejects.toMatchObject({
      code: 'network',
      message: 'Agents service is temporarily unavailable',
    });
  });

  it('rejects non-loopback bridge configuration before making a request', () => {
    const fetchMock = vi.fn();

    expect(() =>
      createAgentsClient({
        bridgeUrl: 'https://agents.example.test',
        bridgeToken: 'bridge-secret',
        clientId: '11111111-1111-4111-8111-111111111111',
        fetchImpl: fetchMock,
      })
    ).toThrow('Agents Adapter bridge URL must use loopback HTTP');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['', 'not-a-client-id', '11111111-1111-1111-1111-111111111111'])(
    'rejects invalid stdio client identity %j before making a request',
    (clientId) => {
      const fetchMock = vi.fn();

      expect(() =>
        createAgentsClient({
          bridgeUrl: 'http://127.0.0.1:43123',
          bridgeToken: 'bridge-secret',
          clientId,
          fetchImpl: fetchMock,
        })
      ).toThrow('Agents Adapter client identity is invalid');
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
});
