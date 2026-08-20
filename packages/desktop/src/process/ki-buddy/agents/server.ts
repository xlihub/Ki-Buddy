#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AGENTS_MCP_BRIDGE_TOKEN_ENV, AGENTS_MCP_BRIDGE_URL_ENV, createAgentsClient } from './client';
import { AgentsMcpError } from './errors';
import { createAgentsMcpServer } from './mcpServer';

type AdapterProcess = Pick<NodeJS.Process, 'env' | 'exitCode' | 'once' | 'ppid' | 'stderr' | 'stdin'>;
type AdapterServer = ReturnType<typeof createAgentsMcpServer>;
type AdapterTransport = InstanceType<typeof StdioServerTransport>;
type AgentsMcpAdapterDependencies = Readonly<{
  createClient: typeof createAgentsClient;
  createServer: (client: ReturnType<typeof createAgentsClient>) => AdapterServer;
  createTransport: () => AdapterTransport;
  process: AdapterProcess;
  watchParent: (checkParent: () => void) => () => void;
}>;

const defaultDependencies: AgentsMcpAdapterDependencies = {
  createClient: createAgentsClient,
  createServer: createAgentsMcpServer,
  createTransport: () => new StdioServerTransport(),
  process,
  watchParent: (checkParent) => {
    const watcher = setInterval(checkParent, 1000);
    watcher.unref();
    return () => clearInterval(watcher);
  },
};

const writeDiagnostic = (runtimeProcess: AdapterProcess, event: string, code?: string): void => {
  runtimeProcess.stderr.write(`[agents-mcp-adapter] ${JSON.stringify({ event, ...(code ? { code } : {}) })}\n`);
};

/** Starts the stdio Adapter and binds its lifetime to the owning MCP process. */
export async function startAgentsMcpAdapter(overrides: Partial<AgentsMcpAdapterDependencies> = {}): Promise<void> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const runtimeProcess = dependencies.process;
  try {
    const client = dependencies.createClient({
      bridgeUrl: runtimeProcess.env[AGENTS_MCP_BRIDGE_URL_ENV] ?? '',
      bridgeToken: runtimeProcess.env[AGENTS_MCP_BRIDGE_TOKEN_ENV] ?? '',
    });
    const server = dependencies.createServer(client);
    const transport = dependencies.createTransport();
    const initialParentPid = runtimeProcess.ppid;
    let closing = false;

    let stopParentWatch: () => void;
    const shutdown = async (reason: string): Promise<void> => {
      if (closing) return;
      closing = true;
      stopParentWatch();
      try {
        await server.close();
      } catch {
        writeDiagnostic(runtimeProcess, 'server.close_failed');
      }
      if (reason !== 'stdin_eof') runtimeProcess.exitCode = 0;
    };

    stopParentWatch = dependencies.watchParent(() => {
      if (runtimeProcess.ppid <= 1 || runtimeProcess.ppid !== initialParentPid) void shutdown('parent_exit');
    });

    runtimeProcess.stdin.once('end', () => void shutdown('stdin_eof'));
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      runtimeProcess.once(signal, () => void shutdown(signal));
    }

    await server.connect(transport);
  } catch (error) {
    writeDiagnostic(runtimeProcess, 'server.failed', error instanceof AgentsMcpError ? error.code : 'server');
    runtimeProcess.exitCode = 1;
  }
}

if (require.main === module) void startAgentsMcpAdapter();
