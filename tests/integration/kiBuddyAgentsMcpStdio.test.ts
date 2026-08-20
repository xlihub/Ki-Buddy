import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startAgentsMcpRuntimeBridge } from '@/process/ki-buddy/agents';
import { startAgentsMcpBridge, type AgentsMcpBridgeHandle } from '@/process/ki-buddy/agents/bridge';
import { createAgentsCatalogClient, type AgentsCatalogClient } from '@/process/ki-buddy/agents/client';
import { AgentsMcpError } from '@/process/ki-buddy/agents/errors';

const projectRoot = path.resolve(__dirname, '../..');
const adapterScript = path.join(projectRoot, 'out/main/builtin-mcp-agents.js');
const bridges: AgentsMcpBridgeHandle[] = [];
const clients: Client[] = [];
const childProcesses: ChildProcess[] = [];
const externalProcessIds = new Set<number>();
const fakeGateways: Array<Readonly<{ close: () => Promise<void> }>> = [];
const adapterEnvironment = {
  KI_BUDDY_AGENTS_ADAPTER_BRIDGE_URL: 'http://127.0.0.1:43123',
  KI_BUDDY_AGENTS_ADAPTER_BRIDGE_TOKEN: 'process-exit-secret',
};
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

type FakeCatalogGateway = Readonly<{
  baseUrl: string;
  close: () => Promise<void>;
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
  const server = createServer((request, response) => {
    paths.push(request.url ?? '');
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
  fakeGateways.push(gateway);
  return gateway;
}

async function startGatewayBackedBridge(binding: MutableSessionBinding): Promise<AgentsMcpBridgeHandle> {
  const authService = {
    getSession: async () => ({
      status: 'authenticated',
      user: {
        id: 'core-user',
        agents: { deploymentUrl: binding.deploymentUrl, userId: binding.userId },
      },
    }),
    getSessionEpoch: () => binding.sessionEpoch,
    fetchAuthenticated: (requestPath: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      headers.set('authorization', 'Bearer fake-agents-token');
      return fetch(`${binding.deploymentUrl}${requestPath}`, { ...init, headers });
    },
  };
  const bridge = await startAgentsMcpRuntimeBridge(authService as never, {});
  bridges.push(bridge);
  return bridge;
}

async function createGatewayBackedClient(
  binding: MutableSessionBinding,
  options: Readonly<{ now?: () => number }> = {}
): Promise<AgentsCatalogClient> {
  const bridge = await startGatewayBackedBridge(binding);
  return createAgentsCatalogClient({
    bridgeToken: bridge.token,
    bridgeUrl: bridge.url,
    ...options,
  });
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

beforeAll(() => {
  execFileSync(process.execPath, [path.join(projectRoot, 'scripts/build-mcp-servers.js')], {
    cwd: projectRoot,
    stdio: 'pipe',
  });
});

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((client) => client.close()));
  await Promise.allSettled(bridges.splice(0).map((bridge) => bridge.close()));
  await Promise.allSettled(fakeGateways.splice(0).map((gateway) => gateway.close()));
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

describe('packaged Agents MCP stdio entry', () => {
  it('applies TTL and force refresh through a local fake Agents Gateway', async () => {
    let currentTime = 10_000;
    const gateway = await startFakeCatalogGateway();
    const client = await createGatewayBackedClient(
      { deploymentUrl: gateway.baseUrl, sessionEpoch: 1, userId: 'user-1' },
      { now: () => currentTime }
    );

    await client.list();
    await client.list();
    await client.list({ forceRefresh: true });
    currentTime += 5 * 60 * 1000;
    await client.list();

    expect(gateway.requestPaths()).toEqual([
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
    ]);
  });

  it('invalidates a local fake Gateway cache when the same account starts a new session', async () => {
    const gateway = await startFakeCatalogGateway();
    const binding = { deploymentUrl: gateway.baseUrl, sessionEpoch: 1, userId: 'user-1' };
    const client = await createGatewayBackedClient(binding);

    await client.list();
    binding.sessionEpoch = 2;
    gateway.setCatalog({
      ...fakeCatalog,
      agents: [{ ...fakeCatalog.agents[0], agentId: 'agent-after-reauthentication' }],
    });

    await expect(client.list()).resolves.toMatchObject({
      agents: [{ agentId: 'agent-after-reauthentication' }],
    });
    expect(gateway.requestPaths()).toEqual(['/bridge/agents/catalog', '/bridge/agents/catalog']);
  });

  it('invalidates a local fake Gateway cache when deployment origin changes', async () => {
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

  it('rejects a candidate revoked by the local fake Gateway without invoking an agent', async () => {
    const gateway = await startFakeCatalogGateway();
    const client = await createGatewayBackedClient({
      deploymentUrl: gateway.baseUrl,
      sessionEpoch: 1,
      userId: 'user-1',
    });

    await client.list();
    gateway.setCatalog({ status: 'ok', total: 0, agents: [] });

    await expect(client.describe('agent-feedback')).rejects.toMatchObject({ code: 'not_found' });
    await expect(client.list()).resolves.toEqual({ total: 0, agents: [] });
    expect(gateway.requestPaths()).toEqual([
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
      '/bridge/agents/catalog',
    ]);
  });

  it('clears cached inventory when the local fake Gateway rejects authentication', async () => {
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

  it('fails closed on ambiguous and incompatible local fake Gateway catalogs', async () => {
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

    await expect(client.list()).rejects.toMatchObject({ code: 'ambiguous' });
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
    const identity = { deploymentOrigin: 'https://agents.example.test', sessionEpoch: 1, userId: 'user-1' };
    const bridge = await startAgentsMcpBridge({
      token: 'stdio-bridge-secret',
      getSessionIdentity: vi.fn().mockResolvedValue(identity),
      fetchCatalog: vi.fn(() =>
        Promise.resolve({
          identity,
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
    expect(tools.tools.map(({ name }) => name)).toEqual(['agents_list', 'agents_describe']);
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
      { code: 'network' as const, message: 'Agents Adapter bridge is unavailable' },
      { code: 'server' as const, message: 'Agents catalog service is unavailable' },
      { code: 'contract' as const, message: 'Agents catalog response is incompatible' },
    ];

    await Promise.all(
      cases.map(async (testCase) => {
        const bridge = await startAgentsMcpBridge({
          getSessionIdentity: vi.fn().mockResolvedValue({
            deploymentOrigin: 'https://agents.example.test',
            sessionEpoch: 1,
            userId: `user-${testCase.code}`,
          }),
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
