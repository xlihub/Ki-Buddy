import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMcpServer } from '@/common/config/storage';
import { AGENTS_MCP_SERVER_NAME, ensureAgentsMcpRegistration } from '@/process/ki-buddy/agents/registration';

const defaultMcpDependencies = vi.hoisted(() => ({
  batchImportServers: vi.fn(),
  getBuiltinMcpScriptPath: vi.fn(),
  listServers: vi.fn(),
  updateServer: vi.fn(),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: {
    batchImportServers: { invoke: defaultMcpDependencies.batchImportServers },
    listServers: { invoke: defaultMcpDependencies.listServers },
    updateServer: { invoke: defaultMcpDependencies.updateServer },
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  getBuiltinMcpScriptPath: defaultMcpDependencies.getBuiltinMcpScriptPath,
}));

const listServers = vi.fn();
const batchImportServers = vi.fn();
const updateServer = vi.fn();
const getScriptPath = vi.fn(() => '/Applications/Ki-Buddy/resources/app.asar.unpacked/out/main/builtin-mcp-agents.js');

const existingServer = (overrides: Partial<IMcpServer> = {}): IMcpServer => ({
  id: 'agents-mcp-id',
  name: AGENTS_MCP_SERVER_NAME,
  description: 'List the Agents catalog available to the current Ki-Buddy account.',
  enabled: true,
  builtin: true,
  transport: {
    type: 'stdio',
    command: 'node',
    args: ['/Applications/Ki-Buddy/resources/app.asar.unpacked/out/main/builtin-mcp-agents.js'],
  },
  original_json: JSON.stringify(
    {
      mcpServers: {
        [AGENTS_MCP_SERVER_NAME]: {
          command: 'node',
          args: ['/Applications/Ki-Buddy/resources/app.asar.unpacked/out/main/builtin-mcp-agents.js'],
        },
      },
    },
    null,
    2
  ),
  created_at: 1,
  updated_at: 1,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  defaultMcpDependencies.getBuiltinMcpScriptPath.mockReturnValue(
    '/Applications/Ki-Buddy/resources/app.asar.unpacked/out/main/builtin-mcp-agents.js'
  );
  defaultMcpDependencies.listServers.mockResolvedValue([]);
  defaultMcpDependencies.batchImportServers.mockResolvedValue([]);
  defaultMcpDependencies.updateServer.mockResolvedValue(existingServer());
  listServers.mockResolvedValue([]);
  batchImportServers.mockResolvedValue([]);
  updateServer.mockResolvedValue(existingServer());
});

describe('ensureAgentsMcpRegistration', () => {
  it('uses the packaged script resolver and generic MCP API by default', async () => {
    await ensureAgentsMcpRegistration();

    expect(defaultMcpDependencies.getBuiltinMcpScriptPath).toHaveBeenCalledWith('builtin-mcp-agents');
    expect(defaultMcpDependencies.listServers).toHaveBeenCalledOnce();
    expect(defaultMcpDependencies.batchImportServers).toHaveBeenCalledWith({
      servers: [
        expect.objectContaining({
          builtin: true,
          name: AGENTS_MCP_SERVER_NAME,
          transport: expect.objectContaining({ command: 'node' }),
        }),
      ],
    });
  });

  it('registers one enabled built-in stdio server with only the packaged script path', async () => {
    await ensureAgentsMcpRegistration({ listServers, batchImportServers, updateServer, getScriptPath });

    expect(batchImportServers).toHaveBeenCalledWith({
      servers: [
        {
          name: AGENTS_MCP_SERVER_NAME,
          description: 'List the Agents catalog available to the current Ki-Buddy account.',
          enabled: true,
          builtin: true,
          transport: {
            type: 'stdio',
            command: 'node',
            args: ['/Applications/Ki-Buddy/resources/app.asar.unpacked/out/main/builtin-mcp-agents.js'],
          },
          original_json: JSON.stringify(
            {
              mcpServers: {
                [AGENTS_MCP_SERVER_NAME]: {
                  command: 'node',
                  args: ['/Applications/Ki-Buddy/resources/app.asar.unpacked/out/main/builtin-mcp-agents.js'],
                },
              },
            },
            null,
            2
          ),
        },
      ],
    });
    expect(JSON.stringify(batchImportServers.mock.calls[0])).not.toContain('TOKEN');
    expect(JSON.stringify(batchImportServers.mock.calls[0])).not.toContain('BASE_URL');
  });

  it('does not write an unchanged registration again', async () => {
    listServers.mockResolvedValue([existingServer()]);

    await ensureAgentsMcpRegistration({ listServers, batchImportServers, updateServer, getScriptPath });

    expect(batchImportServers).not.toHaveBeenCalled();
    expect(updateServer).not.toHaveBeenCalled();
  });

  it('updates the existing built-in record when the packaged script path changed', async () => {
    listServers.mockResolvedValue([
      existingServer({
        enabled: false,
        transport: { type: 'stdio', command: 'node', args: ['/old/location/builtin-mcp-agents.js'] },
        original_json: '{"legacy":true}',
      }),
    ]);

    await ensureAgentsMcpRegistration({ listServers, batchImportServers, updateServer, getScriptPath });

    expect(updateServer).toHaveBeenCalledWith({
      id: 'agents-mcp-id',
      data: expect.objectContaining({
        description: 'List the Agents catalog available to the current Ki-Buddy account.',
        enabled: true,
        builtin: true,
        transport: {
          type: 'stdio',
          command: 'node',
          args: ['/Applications/Ki-Buddy/resources/app.asar.unpacked/out/main/builtin-mcp-agents.js'],
        },
      }),
    });
    expect(batchImportServers).not.toHaveBeenCalled();
  });

  it('refuses to replace a Custom MCP that already uses the product server name', async () => {
    listServers.mockResolvedValue([
      existingServer({
        builtin: false,
        transport: { type: 'stdio', command: 'custom-adapter', args: [] },
      }),
    ]);

    await expect(
      ensureAgentsMcpRegistration({ listServers, batchImportServers, updateServer, getScriptPath })
    ).rejects.toThrow('conflicts with an existing Custom MCP');
    expect(batchImportServers).not.toHaveBeenCalled();
    expect(updateServer).not.toHaveBeenCalled();
  });
});
