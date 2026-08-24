import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startAgentsMcpRuntimeBridge } from '@/process/ki-buddy/agents';
import { startAgentsMcpBridge, type AgentsMcpBridgeHandle } from '@/process/ki-buddy/agents/bridge';
import { createAgentsClient, type AgentsClient } from '@/process/ki-buddy/agents/client';
import { AgentsMcpError } from '@/process/ki-buddy/agents/errors';

const projectRoot = path.resolve(__dirname, '../..');
let adapterBundleDirectory: string | undefined;
let adapterScript = '';
const bridges: AgentsMcpBridgeHandle[] = [];
const clients: Client[] = [];
const childProcesses: ChildProcess[] = [];
const externalProcessIds = new Set<number>();
const fakeServers: Array<Readonly<{ close: () => Promise<void> }>> = [];
const tempDirectories = new Set<string>();
const adapterEnvironment = {
  KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL: 'http://127.0.0.1:43123',
  KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN: 'process-exit-secret',
};
type RuntimeAuthService = Parameters<typeof startAgentsMcpRuntimeBridge>[0];
const initializeRequest = `${JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'agents-mcp-lifecycle-test', version: '1.0.0' },
  },
})}\n`;

const fakeCatalog = {
  status: 'ok',
  total: 1,
  agents: [
    {
      agentId: 'agent-feedback',
      agentTitle: 'Feedback analyst',
      agentDescription: 'Summarizes customer feedback.',
      agentType: 'workflow',
      defaultInputModes: [{ name: 'query', description: 'Feedback text', type: 'text', required: true }],
      defaultOutputModes: [{ name: 'summary', description: 'Summary', type: 'text', required: true }],
    },
  ],
};

const fileAgentCatalog = {
  status: 'ok',
  total: 1,
  agents: [
    {
      agentId: 'agent-file',
      agentTitle: 'File agent',
      agentType: 'workflow',
      defaultInputModes: [
        {
          name: 'source',
          description: 'Source file',
          type: 'file',
          required: true,
          allowed_file_types: ['txt'],
        },
      ],
      defaultOutputModes: [],
    },
  ],
};

type FakeCatalogGateway = Readonly<{
  baseUrl: string;
  close: () => Promise<void>;
  invokeBodies: () => readonly unknown[];
  requestPaths: () => readonly string[];
  setCatalog: (catalog: unknown) => void;
  setStatus: (status: number) => void;
}>;

type MutableSessionBinding = {
  deploymentUrl: string;
  sessionEpoch: number;
  userId: string;
};

async function startFakeCatalogGateway(initialCatalog: unknown = fakeCatalog): Promise<FakeCatalogGateway> {
  let catalog = initialCatalog;
  let status = 200;
  const paths: string[] = [];
  const invokeBodies: unknown[] = [];
  const server = createServer((request, response) => {
    paths.push(request.url ?? '');
    if (
      request.method === 'POST' &&
      request.url === '/bridge/agents/invoke' &&
      request.headers.authorization === 'Bearer fake-agents-token'
    ) {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        invokeBodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            status: 'completed',
            request_id: 'request-redacted-1',
            conversation_id: 'conversation-redacted-1',
            flow_instance_id: 'task-redacted-1',
            result: {
              status: 'completed',
              text: 'Scalar invocation completed.',
              outputs: [{ url: 'https://must-not-be-exposed.invalid/result.pdf' }],
              authorization: 'business authorization value',
            },
            debug: { deploymentUrl: 'https://must-not-be-exposed.invalid' },
          })
        );
      });
      return;
    }
    if (
      request.method !== 'GET' ||
      request.url !== '/bridge/agents/catalog' ||
      request.headers.authorization !== 'Bearer fake-agents-token'
    ) {
      response.writeHead(request.headers.authorization ? 404 : 401).end();
      return;
    }
    if (status !== 200) {
      response.writeHead(status).end();
      return;
    }
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(catalog));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  const gateway = {
    baseUrl: `http://127.0.0.1:${port}`,
    invokeBodies: () => [...invokeBodies],
    requestPaths: () => [...paths],
    setCatalog: (nextCatalog: unknown) => {
      catalog = nextCatalog;
    },
    setStatus: (nextStatus: number) => {
      status = nextStatus;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
  fakeServers.push(gateway);
  return gateway;
}

async function createTrackedTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirectories.add(directory);
  return directory;
}

async function startGatewayBackedBridge(binding: MutableSessionBinding): Promise<AgentsMcpBridgeHandle> {
  const authService: RuntimeAuthService = {
    getSessionEpoch: () => binding.sessionEpoch,
    fetchAuthenticated: (requestPath: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      headers.set('authorization', 'Bearer fake-agents-token');
      return fetch(`${binding.deploymentUrl}${requestPath}`, { ...init, headers });
    },
  };
  const bridge = await startAgentsMcpRuntimeBridge(authService, {});
  bridges.push(bridge);
  return bridge;
}

async function createGatewayBackedClient(binding: MutableSessionBinding): Promise<AgentsClient> {
  const bridge = await startGatewayBackedBridge(binding);
  return createAgentsClient({
    bridgeToken: bridge.token,
    bridgeUrl: bridge.url,
    clientId: '11111111-1111-4111-8111-111111111111',
  });
}

async function connectStdioAdapter(
  name: string,
  bridge: AgentsMcpBridgeHandle,
  env: Readonly<Record<string, string>> = {}
): Promise<Readonly<{ client: Client; processId: number | null }>> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [adapterScript],
    env: {
      KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN: bridge.token,
      KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL: bridge.url,
      ...env,
    },
    stderr: 'pipe',
  });
  const client = new Client({ name, version: '1.0.0' });
  clients.push(client);
  await client.connect(transport);
  return { client, processId: transport.pid };
}

async function connectGatewayBackedStdioAdapter(name: string): Promise<
  Readonly<{
    bridge: AgentsMcpBridgeHandle;
    binding: MutableSessionBinding;
    client: Client;
    gateway: FakeCatalogGateway;
    readStderr: () => string;
  }>
> {
  const gateway = await startFakeCatalogGateway();
  const binding = {
    deploymentUrl: gateway.baseUrl,
    sessionEpoch: 1,
    userId: 'user-1',
  };
  const bridge = await startGatewayBackedBridge(binding);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [adapterScript],
    env: {
      KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN: bridge.token,
      KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL: bridge.url,
    },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const client = new Client({ name, version: '1.0.0' });
  clients.push(client);
  await client.connect(transport);
  return { binding, bridge, client, gateway, readStderr: () => stderr };
}

async function waitForLine(stream: NodeJS.ReadableStream, timeoutMessage: string): Promise<string> {
  const lines = createInterface({ input: stream });
  try {
    return await Promise.race([
      once(lines, 'line').then(([line]) => String(line)),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error(timeoutMessage)), 5_000).unref();
      }),
    ]);
  } finally {
    lines.close();
  }
}

async function waitForExit(
  child: ChildProcess,
  timeoutMessage: string
): Promise<[number | null, NodeJS.Signals | null]> {
  if (child.exitCode !== null || child.signalCode !== null) return [child.exitCode, child.signalCode];
  return Promise.race([
    once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), 5_000).unref();
    }),
  ]);
}

async function initializeAdapter(child: ChildProcess): Promise<void> {
  if (!child.stdin || !child.stdout) throw new Error('Agents MCP Adapter stdio is unavailable');
  const response = waitForLine(child.stdout, 'Agents MCP Adapter did not complete initialize');
  child.stdin.write(initializeRequest);
  expect(JSON.parse(await response)).toMatchObject({
    jsonrpc: '2.0',
    id: 1,
    result: { serverInfo: expect.any(Object) },
  });
}

async function waitForProcessIdExit(processId: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      process.kill(processId, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
      throw error;
    }
    // oxlint-disable-next-line no-await-in-loop -- Process exit polling must remain sequential.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Agents MCP Adapter process ${processId} did not exit after its parent ended`);
}

beforeAll(async () => {
  adapterBundleDirectory = await mkdtemp(path.join(os.tmpdir(), 'ki-buddy-agents-mcp-bundle-'));
  adapterScript = path.join(adapterBundleDirectory, 'builtin-mcp-agents.js');
  execFileSync(
    process.execPath,
    [path.join(projectRoot, 'scripts/build-mcp-servers.js'), '--out-dir', adapterBundleDirectory],
    {
      cwd: projectRoot,
      stdio: 'pipe',
    }
  );
});

afterAll(async () => {
  if (!adapterBundleDirectory) return;
  await rm(adapterBundleDirectory, { recursive: true, force: true });
  adapterBundleDirectory = undefined;
  adapterScript = '';
});

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((client) => client.close()));
  await Promise.allSettled(bridges.splice(0).map((bridge) => bridge.close()));
  await Promise.allSettled(fakeServers.splice(0).map((server) => server.close()));
  await Promise.allSettled([...tempDirectories].map((directory) => rm(directory, { recursive: true, force: true })));
  tempDirectories.clear();
  await Promise.all(
    childProcesses.splice(0).map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = waitForExit(child, `Test child process ${child.pid ?? 'unknown'} did not exit during cleanup`);
      child.kill('SIGKILL');
      await exited;
    })
  );
  await Promise.all(
    [...externalProcessIds].map(async (processId) => {
      try {
        process.kill(processId, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        externalProcessIds.delete(processId);
        return;
      }
      process.kill(processId, 'SIGKILL');
      await waitForProcessIdExit(processId);
      externalProcessIds.delete(processId);
    })
  );
});

describe('packaged Agents MCP Adapter stdio process', () => {
  it('uploads a local file path and invokes with the remote file URL', async () => {
    const directory = await createTrackedTempDirectory('ki-buddy-agents-stdio-upload-');
    const filePath = path.join(directory, 'feedback.txt');
    await writeFile(filePath, 'stdio upload canary');
    const invokeAgent = vi.fn().mockResolvedValue(Response.json({ state: 'completed' }));
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async () => ({
        response: Response.json(fileAgentCatalog),
        sessionEpoch: 1,
      })),
      uploadFile: vi.fn().mockImplementation(async (body) => {
        const chunks: Buffer[] = [];
        for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        expect(Buffer.concat(chunks).toString('utf8')).toContain('stdio upload canary');
        return {
          fileUrl: 'https://agents.example.test/files/remote-stdio',
          sessionEpoch: 1,
        };
      }),
      invokeAgent,
      token: 'bridge-secret-stdio-upload',
    });
    bridges.push(bridge);

    const { client } = await connectStdioAdapter('ki-buddy-agents-file-upload', bridge);
    const uploadResult = await client.callTool({
      name: 'agents_upload_file',
      arguments: { agentId: 'agent-file', fieldName: 'source', filePath },
    });
    expect(uploadResult.isError).not.toBe(true);
    const uploadText = (uploadResult.content[0] as { text: string }).text;
    const { fileUrl } = JSON.parse(uploadText) as { fileUrl: string };

    const invokeResult = await client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-file', inputs: { source: fileUrl } },
    });

    expect(invokeResult.isError).not.toBe(true);
    expect(invokeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: { source: 'https://agents.example.test/files/remote-stdio' },
      }),
      1,
      expect.any(String),
      expect.any(AbortSignal)
    );
  });

  it.each([
    ['remote upload failure', 'server'],
    ['expired upload authentication', 'auth'],
  ] as const)('stops before invoke after %s', async (_scenario, expectedCode) => {
    const directory = await createTrackedTempDirectory('ki-buddy-agents-stdio-upload-failure-');
    const filePath = path.join(directory, 'feedback.txt');
    await writeFile(filePath, 'stdio upload failure canary');
    const invokeAgent = vi.fn();
    const uploadFile = vi.fn(async (body: IncomingMessage) => {
      for await (const _chunk of body) {
        // Consume the multipart stream before returning the simulated remote response.
      }
      throw new AgentsMcpError(expectedCode, 'sensitive upstream detail');
    });
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockResolvedValue({ response: Response.json(fileAgentCatalog), sessionEpoch: 1 }),
      uploadFile,
      invokeAgent,
      token: `bridge-secret-stdio-upload-${expectedCode}`,
    });
    bridges.push(bridge);
    const { client } = await connectStdioAdapter(`ki-buddy-agents-file-upload-${expectedCode}`, bridge);

    const result = await client.callTool({
      name: 'agents_upload_file',
      arguments: { agentId: 'agent-file', fieldName: 'source', filePath },
    });
    const payload = JSON.parse((result.content[0] as { text: string }).text) as { error?: { code?: string } };

    expect({
      errorCode: payload.error?.code,
      invokeCalls: invokeAgent.mock.calls.length,
      isError: result.isError,
      uploadCalls: uploadFile.mock.calls.length,
    }).toEqual({ errorCode: expectedCode, invokeCalls: 0, isError: true, uploadCalls: 1 });
  });

  it('does not dispatch an upload after the authenticated session changes following catalog validation', async () => {
    const directory = await createTrackedTempDirectory('ki-buddy-agents-stdio-session-change-');
    const filePath = path.join(directory, 'feedback.txt');
    await writeFile(filePath, 'stdio session change canary');
    let epochReads = 0;
    const fetchAuthenticated = vi.fn(async (requestPath: string) => {
      if (requestPath !== '/bridge/agents/catalog') throw new Error('Upload must not be dispatched');
      return Response.json(fileAgentCatalog);
    });
    const authService: RuntimeAuthService = {
      fetchAuthenticated,
      getSessionEpoch: () => {
        epochReads += 1;
        return epochReads <= 2 ? 1 : 2;
      },
    };
    const bridge = await startAgentsMcpRuntimeBridge(authService, {});
    bridges.push(bridge);
    const { client } = await connectStdioAdapter('ki-buddy-agents-file-upload-session-change', bridge);

    const result = await client.callTool({
      name: 'agents_upload_file',
      arguments: { agentId: 'agent-file', fieldName: 'source', filePath },
    });
    const payload = JSON.parse((result.content[0] as { text: string }).text) as { error?: { code?: string } };

    expect({
      errorCode: payload.error?.code,
      isError: result.isError,
      remoteCalls: fetchAuthenticated.mock.calls.length,
    }).toEqual({ errorCode: 'auth', isError: true, remoteCalls: 1 });
  });

  it('keeps distinct direct Adapter clients isolated while one invoke is pending', async () => {
    let finishInvoke: ((response: Response) => void) | undefined;
    let invokeClientId = '';
    const catalogClientIds: string[] = [];
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async (clientId: string) => {
        catalogClientIds.push(clientId);
        return { response: Response.json(fakeCatalog), sessionEpoch: 1 };
      }),
      invokeAgent: vi.fn().mockImplementation(
        (_request: unknown, _sessionEpoch: number, clientId: string) =>
          new Promise<Response>((resolve) => {
            invokeClientId = clientId;
            finishInvoke = resolve;
          })
      ),
      token: 'bridge-secret-conversation-isolation',
    });
    bridges.push(bridge);
    const invokeAdapter = await connectStdioAdapter('ki-buddy-agents-concurrent-invoke', bridge);
    const listAdapter = await connectStdioAdapter('ki-buddy-agents-concurrent-list', bridge);
    expect(invokeAdapter.processId).toEqual(expect.any(Number));
    expect(listAdapter.processId).toEqual(expect.any(Number));
    expect(listAdapter.processId).not.toBe(invokeAdapter.processId);

    const invoke = invokeAdapter.client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-feedback', inputs: { query: 'Long task' } },
    });
    await vi.waitFor(() => expect(invokeClientId).not.toBe(''));

    const list = await listAdapter.client.callTool({ name: 'agents_list', arguments: {} });
    expect(list.isError).not.toBe(true);
    const listClientId = catalogClientIds.at(-1);
    expect(listClientId).toEqual(expect.any(String));
    expect(listClientId).not.toBe(invokeClientId);

    finishInvoke?.(Response.json({ state: 'completed', result: { rows: [] } }));
    expect((await invoke).isError).not.toBe(true);
  });

  it('dispatches invokes from distinct direct Adapter processes without a client-side queue', async () => {
    const finishInvokes: Array<(response: Response) => void> = [];
    const invokeClientIds: string[] = [];
    const bridge = await startAgentsMcpBridge({
      fetchCatalog: vi.fn().mockImplementation(async () => ({ response: Response.json(fakeCatalog), sessionEpoch: 1 })),
      invokeAgent: vi.fn().mockImplementation(
        (_request: unknown, _sessionEpoch: number, clientId: string) =>
          new Promise<Response>((resolve) => {
            invokeClientIds.push(clientId);
            finishInvokes.push(resolve);
          })
      ),
      token: 'bridge-secret-concurrent-invokes',
    });
    bridges.push(bridge);
    const firstAdapter = await connectStdioAdapter('ki-buddy-agents-conversation-one', bridge);
    const secondAdapter = await connectStdioAdapter('ki-buddy-agents-conversation-two', bridge);
    expect(firstAdapter.processId).toEqual(expect.any(Number));
    expect(secondAdapter.processId).toEqual(expect.any(Number));
    expect(secondAdapter.processId).not.toBe(firstAdapter.processId);

    const firstInvoke = firstAdapter.client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-feedback', inputs: { query: 'First long task' } },
    });
    const secondInvoke = secondAdapter.client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-feedback', inputs: { query: 'Second long task' } },
    });

    await vi.waitFor(() => expect(invokeClientIds).toHaveLength(2));
    expect(new Set(invokeClientIds).size).toBe(2);

    for (const finishInvoke of finishInvokes) {
      finishInvoke(Response.json({ state: 'completed', result: { rows: [] } }));
    }
    const [firstResult, secondResult] = await Promise.all([firstInvoke, secondInvoke]);
    expect(firstResult.isError).not.toBe(true);
    expect(secondResult.isError).not.toBe(true);
  });

  it('completes direct scalar invokes through the self-contained stdio Adapter', async () => {
    const { client, gateway } = await connectGatewayBackedStdioAdapter('ki-buddy-agents-invoke-e2e');

    await client.callTool({ name: 'agents_list', arguments: {} });
    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-feedback' } });
    const result = await client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-feedback', inputs: { query: 'Summarize the release notes.' } },
    });
    const duplicate = await client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-feedback', inputs: { query: 'Summarize the release notes.' } },
    });

    expect(result.content).toEqual([
      {
        type: 'text',
        text: JSON.stringify({
          status: 'completed',
          request_id: 'request-redacted-1',
          conversation_id: 'conversation-redacted-1',
          flow_instance_id: 'task-redacted-1',
          result: {
            status: 'completed',
            text: 'Scalar invocation completed.',
            outputs: [{ url: 'https://must-not-be-exposed.invalid/result.pdf' }],
            authorization: 'business authorization value',
          },
          debug: { deploymentUrl: 'https://must-not-be-exposed.invalid' },
        }),
      },
    ]);
    expect(duplicate.isError).not.toBe(true);
    expect(gateway.requestPaths()).toEqual([
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
      '/bridge/agents/invoke',
      '/bridge/agents/catalog',
      '/bridge/agents/invoke',
    ]);
    expect(gateway.invokeBodies()).toHaveLength(2);
  });

  it('keeps bridge credentials and raw invoke fields out of stdio diagnostics', async () => {
    const { bridge, client, readStderr } = await connectGatewayBackedStdioAdapter('ki-buddy-agents-invoke-diagnostics');

    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-feedback' } });
    await client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-feedback', inputs: { query: 'Summarize the release notes.' } },
    });

    expect(
      [bridge.token, bridge.url, 'must-not-be-exposed.invalid'].filter((value) => readStderr().includes(value))
    ).toEqual([]);
  });

  it('uses a fresh current-account catalog when the binding changes after describe', async () => {
    const { binding, client, gateway } = await connectGatewayBackedStdioAdapter(
      'ki-buddy-agents-account-bound-invoke-e2e'
    );

    await client.callTool({ name: 'agents_describe', arguments: { agentId: 'agent-feedback' } });
    binding.sessionEpoch = 2;
    binding.userId = 'user-2';
    const result = await client.callTool({
      name: 'agents_invoke',
      arguments: { agentId: 'agent-feedback', inputs: { query: 'Must not dispatch.' } },
    });

    expect(result.isError).not.toBe(true);
    expect(gateway.invokeBodies()).toHaveLength(1);
    expect(gateway.requestPaths()).toEqual([
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
      '/bridge/agents/invoke',
    ]);
  });

  it('direct invokes one catalog agent with scalar inputs and returns the complete success response', async () => {
    const gateway = await startFakeCatalogGateway();
    const client = await createGatewayBackedClient({
      deploymentUrl: gateway.baseUrl,
      sessionEpoch: 1,
      userId: 'user-1',
    });

    await client.describe('agent-feedback');
    await expect(client.invoke('agent-feedback', { query: 'Summarize the release notes.' })).resolves.toEqual({
      status: 'completed',
      request_id: 'request-redacted-1',
      conversation_id: 'conversation-redacted-1',
      flow_instance_id: 'task-redacted-1',
      result: {
        status: 'completed',
        text: 'Scalar invocation completed.',
        outputs: [{ url: 'https://must-not-be-exposed.invalid/result.pdf' }],
        authorization: 'business authorization value',
      },
      debug: { deploymentUrl: 'https://must-not-be-exposed.invalid' },
    });
    expect(gateway.requestPaths()).toEqual([
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
      '/bridge/agents/invoke',
    ]);
    expect(gateway.invokeBodies()).toEqual([
      {
        agentId: 'agent-feedback',
        agentType: 'workflow',
        conversationId: expect.stringMatching(/^ki-buddy-/u),
        inputs: { query: 'Summarize the release notes.' },
      },
    ]);
  });

  it('fetches a current catalog for every discovery operation', async () => {
    const gateway = await startFakeCatalogGateway();
    const client = await createGatewayBackedClient({
      deploymentUrl: gateway.baseUrl,
      sessionEpoch: 1,
      userId: 'user-1',
    });

    await client.list();
    await client.list();
    await client.list();
    await client.list();

    expect(gateway.requestPaths()).toEqual([
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
    ]);
  });

  it('routes later catalog requests to the current Agents deployment', async () => {
    const gatewayA = await startFakeCatalogGateway();
    const gatewayB = await startFakeCatalogGateway({
      ...fakeCatalog,
      agents: [{ ...fakeCatalog.agents[0], agentId: 'agent-other-deployment' }],
    });
    const binding = { deploymentUrl: gatewayA.baseUrl, sessionEpoch: 1, userId: 'user-1' };
    const client = await createGatewayBackedClient(binding);

    await client.list();
    binding.deploymentUrl = gatewayB.baseUrl;

    await expect(client.list()).resolves.toMatchObject({ agents: [{ agentId: 'agent-other-deployment' }] });
    expect(gatewayA.requestPaths()).toEqual(['/bridge/agents/catalog']);
    expect(gatewayB.requestPaths()).toEqual(['/bridge/agents/catalog']);
  });

  it('rejects a published agent removed from the current catalog without dispatching', async () => {
    const gateway = await startFakeCatalogGateway();
    const client = await createGatewayBackedClient({
      deploymentUrl: gateway.baseUrl,
      sessionEpoch: 1,
      userId: 'user-1',
    });

    await client.list();
    gateway.setCatalog({ status: 'ok', total: 0, agents: [] });

    await expect(client.describe('agent-feedback')).rejects.toMatchObject({ code: 'not_found' });
    expect(gateway.invokeBodies()).toEqual([]);
  });

  it('recovers after catalog authentication rejection and reads the current catalog', async () => {
    const gateway = await startFakeCatalogGateway();
    const client = await createGatewayBackedClient({
      deploymentUrl: gateway.baseUrl,
      sessionEpoch: 1,
      userId: 'user-1',
    });

    await client.list();
    gateway.setStatus(401);
    await expect(client.describe('agent-feedback')).rejects.toMatchObject({ code: 'auth' });
    gateway.setStatus(200);
    gateway.setCatalog({ status: 'ok', total: 0, agents: [] });

    await expect(client.list()).resolves.toEqual({ total: 0, agents: [] });
    expect(gateway.requestPaths()).toEqual([
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
    ]);
  });

  it('omits duplicate inventory entries but rejects an incompatible selected schema', async () => {
    const gateway = await startFakeCatalogGateway({
      ...fakeCatalog,
      total: 2,
      agents: [fakeCatalog.agents[0], fakeCatalog.agents[0]],
    });
    const client = await createGatewayBackedClient({
      deploymentUrl: gateway.baseUrl,
      sessionEpoch: 1,
      userId: 'user-1',
    });

    await expect(client.list()).resolves.toMatchObject({ total: 1, agents: [{ agentId: 'agent-feedback' }] });
    gateway.setCatalog({
      ...fakeCatalog,
      agents: [{ ...fakeCatalog.agents[0], defaultInputModes: [{ name: 'query', type: 'text' }] }],
    });
    await expect(client.describe('agent-feedback')).rejects.toMatchObject({ code: 'contract' });
  });

  it('rejects a missing describe parameter before the local fake Gateway is called', async () => {
    const gateway = await startFakeCatalogGateway();
    const bridge = await startGatewayBackedBridge({
      deploymentUrl: gateway.baseUrl,
      sessionEpoch: 1,
      userId: 'user-1',
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [adapterScript],
      env: {
        KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN: bridge.token,
        KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL: bridge.url,
      },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'ki-buddy-agents-missing-param', version: '1.0.0' });
    clients.push(client);
    await client.connect(transport);

    const result = await client.callTool({ name: 'agents_describe', arguments: {} });

    expect(result.isError).toBe(true);
    expect(gateway.requestPaths()).toEqual([]);
  });

  it('builds a self-contained entry and serves list plus exact describe over real stdio MCP', async () => {
    const bridge = await startAgentsMcpBridge({
      token: 'stdio-bridge-secret',
      fetchCatalog: vi.fn(() =>
        Promise.resolve({
          response: Response.json({
            status: 'ok',
            total: 1,
            agents: [
              {
                agentId: 'agent-feedback',
                agentTitle: 'Feedback analyst',
                agentDescription: 'Summarizes customer feedback.',
                agentType: 'workflow',
                defaultInputModes: [{ name: 'query', description: 'Feedback text', type: 'text', required: true }],
                defaultOutputModes: [{ name: 'summary', description: 'Summary', type: 'text', required: true }],
              },
            ],
          }),
          sessionEpoch: 1,
        })
      ),
    });
    bridges.push(bridge);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [adapterScript],
      env: {
        KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL: bridge.url,
        KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN: bridge.token,
      },
      stderr: 'pipe',
    });
    let stderr = '';
    transport.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    const client = new Client({ name: 'ki-buddy-agents-integration', version: '1.0.0' });
    clients.push(client);

    await client.connect(transport);
    const tools = await client.listTools();
    const result = await client.callTool({ name: 'agents_list', arguments: {} });
    const description = await client.callTool({
      name: 'agents_describe',
      arguments: { agentId: 'agent-feedback' },
    });

    expect(existsSync(adapterScript)).toBe(true);
    expect(tools.tools.map(({ name }) => name)).toEqual([
      'agents_list',
      'agents_describe',
      'agents_upload_file',
      'agents_invoke',
    ]);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: JSON.stringify({
          total: 1,
          agents: [
            {
              agentId: 'agent-feedback',
              title: 'Feedback analyst',
              description: 'Summarizes customer feedback.',
              agentType: 'workflow',
            },
          ],
        }),
      },
    ]);
    expect(description.content).toEqual([
      {
        type: 'text',
        text: JSON.stringify({
          agentId: 'agent-feedback',
          title: 'Feedback analyst',
          description: 'Summarizes customer feedback.',
          agentType: 'workflow',
          inputSchema: [{ name: 'query', description: 'Feedback text', type: 'text', required: true }],
          outputSchema: [{ name: 'summary', description: 'Summary', type: 'text', required: true }],
        }),
      },
    ]);
    expect(stderr).not.toContain(bridge.token);
    expect(stderr).not.toContain(bridge.url);
  });

  it('fails without runtime bridge configuration and keeps stdout protocol-clean', () => {
    const result = spawnSync(process.execPath, [adapterScript], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {},
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('"event":"server.failed"');
    expect(result.stderr).toContain('"code":"configuration"');
  });

  it('preserves network, server, and contract categories through the real stdio chain', async () => {
    const cases = [
      { code: 'network' as const, message: 'Agents service is temporarily unavailable' },
      { code: 'server' as const, message: 'Agents service returned an error' },
      { code: 'contract' as const, message: 'Agents response is incompatible' },
    ];

    await Promise.all(
      cases.map(async (testCase) => {
        const bridge = await startAgentsMcpBridge({
          fetchCatalog: async () => {
            throw new AgentsMcpError(testCase.code, 'sensitive upstream detail');
          },
        });
        bridges.push(bridge);
        const client = new Client({ name: `ki-buddy-agents-${testCase.code}`, version: '1.0.0' });
        clients.push(client);
        await client.connect(
          new StdioClientTransport({
            command: process.execPath,
            args: [adapterScript],
            env: {
              KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL: bridge.url,
              KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN: bridge.token,
            },
            stderr: 'pipe',
          })
        );

        const result = await client.callTool({ name: 'agents_list', arguments: {} });

        expect(result).toMatchObject({ isError: true });
        expect(result.content).toEqual([
          {
            type: 'text',
            text: JSON.stringify({ ok: false, error: { code: testCase.code, message: testCase.message } }),
          },
        ]);
      })
    );
  });

  it('exits after the MCP client closes stdin', async () => {
    const child = spawn(process.execPath, [adapterScript], {
      cwd: projectRoot,
      env: adapterEnvironment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    childProcesses.push(child);
    child.stdin.end();

    const [exitCode] = await Promise.race([
      once(child, 'exit'),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('Agents MCP Adapter did not exit after stdin EOF')), 5_000).unref();
      }),
    ]);

    expect(exitCode).toBe(0);
  });

  it.each(['SIGINT', 'SIGTERM'] as const)('exits after receiving %s', async (signal) => {
    const child = spawn(process.execPath, [adapterScript], {
      cwd: projectRoot,
      env: adapterEnvironment,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    childProcesses.push(child);
    await initializeAdapter(child);

    const exited = waitForExit(child, `Agents MCP Adapter did not exit after ${signal}`);
    child.kill(signal);

    await expect(exited).resolves.toEqual(process.platform === 'win32' ? [null, signal] : [0, null]);
  });

  it.skipIf(process.platform === 'win32')(
    'exits when its direct parent process ends while stdin remains open',
    async () => {
      const parentHarness = spawn(
        process.execPath,
        [
          '-e',
          `const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const child = spawn(process.execPath, [process.argv[1]], { env: process.env, stdio: [3, 'pipe', 'pipe'] });
child.stderr.resume();
createInterface({ input: child.stdout }).once('line', () => process.stdout.write(String(child.pid) + '\\n'));
setInterval(() => {}, 1_000);`,
          adapterScript,
        ],
        {
          cwd: projectRoot,
          env: adapterEnvironment,
          stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
        }
      );
      childProcesses.push(parentHarness);
      const adapterStdin = parentHarness.stdio[3];
      if (!parentHarness.stdout || !adapterStdin || !('write' in adapterStdin)) {
        throw new Error('Parent lifecycle harness stdio is unavailable');
      }
      const adapterProcessIdLine = waitForLine(
        parentHarness.stdout,
        'Parent lifecycle harness did not initialize the Agents MCP Adapter'
      );
      adapterStdin.write(initializeRequest);
      const adapterProcessId = Number(await adapterProcessIdLine);
      if (!Number.isSafeInteger(adapterProcessId) || adapterProcessId <= 0) {
        throw new Error(`Parent lifecycle harness returned an invalid process id: ${adapterProcessId}`);
      }
      externalProcessIds.add(adapterProcessId);

      const parentExited = waitForExit(parentHarness, 'Agents MCP Adapter parent harness did not exit');
      parentHarness.kill('SIGTERM');
      await parentExited;
      await new Promise<void>((resolve, reject) => {
        adapterStdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n', (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await waitForProcessIdExit(adapterProcessId);
      externalProcessIds.delete(adapterProcessId);
    }
  );
});
