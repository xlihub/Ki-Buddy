import { AgentsMcpError } from './errors';

const MAX_CATALOG_AGENTS = 1000;
const MAX_AGENT_ID_LENGTH = 200;
const MAX_AGENT_TITLE_LENGTH = 500;
const MAX_AGENT_DESCRIPTION_LENGTH = 4000;
const MAX_AGENT_TYPE_LENGTH = 100;

export type AgentsCatalogSummary = Readonly<{
  agentId: string;
  agentType: string;
  description: string;
  title: string;
}>;

export type AgentsCatalogInventory = Readonly<{
  agents: readonly AgentsCatalogSummary[];
  total: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string') throw new AgentsMcpError('contract', `${label} must be a string`);
  const normalized = value.trim();
  if (!allowEmpty && normalized.length === 0) {
    throw new AgentsMcpError('contract', `${label} must be a non-empty string`);
  }
  if (normalized.length > maxLength) {
    throw new AgentsMcpError('contract', `${label} exceeds the supported length`);
  }
  return normalized;
}

/** Projects one complete Agents Bridge catalog envelope into its safe public inventory. */
export function normalizeAgentsCatalog(value: unknown): AgentsCatalogInventory {
  if (!isRecord(value) || value.status !== 'ok') {
    throw new AgentsMcpError('contract', 'Agents catalog response has an invalid envelope');
  }
  if (!Number.isSafeInteger(value.total) || (value.total as number) < 0) {
    throw new AgentsMcpError('contract', 'Agents catalog total must be a non-negative integer');
  }
  if (!Array.isArray(value.agents)) {
    throw new AgentsMcpError('contract', 'Agents catalog agents must be an array');
  }
  if (value.agents.length > MAX_CATALOG_AGENTS) {
    throw new AgentsMcpError('contract', 'Agents catalog exceeds the supported inventory capacity');
  }
  if (value.total !== value.agents.length) {
    throw new AgentsMcpError('contract', 'Agents catalog total does not match the inventory');
  }

  const seenAgentIds = new Set<string>();
  const agents = value.agents.map((item): AgentsCatalogSummary => {
    if (!isRecord(item)) throw new AgentsMcpError('contract', 'Agents catalog entry must be an object');
    const agentId = requireString(item.agentId, 'Agents catalog agentId', MAX_AGENT_ID_LENGTH);
    if (seenAgentIds.has(agentId)) {
      throw new AgentsMcpError('contract', 'Agents catalog contains a duplicate agentId');
    }
    seenAgentIds.add(agentId);

    return {
      agentId,
      title: requireString(item.agentTitle, 'Agents catalog agentTitle', MAX_AGENT_TITLE_LENGTH),
      description:
        item.agentDescription === undefined || item.agentDescription === null
          ? ''
          : requireString(item.agentDescription, 'Agents catalog agentDescription', MAX_AGENT_DESCRIPTION_LENGTH, true),
      agentType: requireString(item.agentType, 'Agents catalog agentType', MAX_AGENT_TYPE_LENGTH),
    };
  });

  return { total: agents.length, agents };
}
