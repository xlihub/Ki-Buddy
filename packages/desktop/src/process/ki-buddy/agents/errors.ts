import type { AgentsInvokeCorrelation } from './contracts';

export type AgentsMcpErrorCode =
  | 'ambiguous'
  | 'auth'
  | 'configuration'
  | 'contract'
  | 'invalid_input'
  | 'invoke_failed'
  | 'network'
  | 'not_found'
  | 'server';

type AgentsMcpErrorPresentation = Readonly<{
  bridgeError: string;
  bridgeStatus: number;
  message: string;
}>;

const AGENTS_MCP_ERROR_PRESENTATIONS = {
  ambiguous: {
    bridgeError: 'agents_ambiguous',
    bridgeStatus: 409,
    message: 'Agent identity is ambiguous in the current catalog',
  },
  auth: { bridgeError: 'agents_auth_required', bridgeStatus: 401, message: 'Agents login is required' },
  configuration: {
    bridgeError: 'agents_network_error',
    bridgeStatus: 502,
    message: 'Agents Adapter configuration is unavailable',
  },
  contract: {
    bridgeError: 'agents_contract_error',
    bridgeStatus: 502,
    message: 'Agents catalog response is incompatible',
  },
  invalid_input: {
    bridgeError: 'agents_invalid_input',
    bridgeStatus: 400,
    message: 'Agent inputs do not match the current scalar schema',
  },
  invoke_failed: {
    bridgeError: 'agents_invoke_failed',
    bridgeStatus: 502,
    message: 'Agent execution failed',
  },
  network: {
    bridgeError: 'agents_network_error',
    bridgeStatus: 502,
    message: 'Agents Adapter bridge is unavailable',
  },
  not_found: {
    bridgeError: 'agents_not_found',
    bridgeStatus: 404,
    message: 'Agent is not in the current catalog',
  },
  server: {
    bridgeError: 'agents_server_error',
    bridgeStatus: 502,
    message: 'Agents catalog service is unavailable',
  },
} as const satisfies Readonly<Record<AgentsMcpErrorCode, AgentsMcpErrorPresentation>>;

const BRIDGE_ERROR_CODES = {
  agents_ambiguous: 'ambiguous',
  agents_auth_required: 'auth',
  agents_contract_error: 'contract',
  agents_invalid_input: 'invalid_input',
  agents_invoke_failed: 'invoke_failed',
  agents_network_error: 'network',
  agents_not_found: 'not_found',
  agents_server_error: 'server',
} as const satisfies Readonly<Record<string, AgentsMcpErrorCode>>;

/** Returns the safe Bridge response and MCP message for an internal error category. */
export function getAgentsMcpErrorPresentation(code: AgentsMcpErrorCode): AgentsMcpErrorPresentation {
  return AGENTS_MCP_ERROR_PRESENTATIONS[code];
}

/** Maps a sanitized Bridge error envelope to its internal category when recognized. */
export function resolveAgentsBridgeErrorCode(value: unknown): AgentsMcpErrorCode | null {
  if (typeof value !== 'object' || value === null || !('error' in value)) return null;
  const error = value.error;
  return typeof error === 'string' && error in BRIDGE_ERROR_CODES
    ? BRIDGE_ERROR_CODES[error as keyof typeof BRIDGE_ERROR_CODES]
    : null;
}

/** Error safe to return through the local Adapter bridge and MCP tool response. */
export class AgentsMcpError extends Error {
  constructor(
    readonly code: AgentsMcpErrorCode,
    message: string,
    readonly correlation?: AgentsInvokeCorrelation
  ) {
    super(message);
    this.name = 'AgentsMcpError';
  }
}
