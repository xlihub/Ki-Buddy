import { AgentsMcpError } from './errors';

const MAX_CATALOG_AGENTS = 1000;
const MAX_AGENT_ID_LENGTH = 200;
const MAX_AGENT_TITLE_LENGTH = 500;
const MAX_AGENT_DESCRIPTION_LENGTH = 4000;
const MAX_AGENT_TYPE_LENGTH = 100;
const MAX_SCHEMA_FIELDS = 200;
const MAX_SCHEMA_FIELD_NAME_LENGTH = 200;
const MAX_ALLOWED_FILE_TYPES = 100;
const MAX_ALLOWED_FILE_TYPE_LENGTH = 200;

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

export type AgentsCatalogIdentity = Readonly<{
  deploymentOrigin: string;
  sessionEpoch: number;
  userId: string;
}>;

export type AgentsSchemaField = Readonly<{
  allowed_file_types?: readonly string[];
  description: string;
  name: string;
  required: boolean;
  type: string;
}>;

export type AgentsCatalogDescription = AgentsCatalogSummary &
  Readonly<{
    inputSchema: readonly AgentsSchemaField[];
    outputSchema: readonly AgentsSchemaField[];
  }>;

export type AgentsCatalogSelection = Readonly<{
  description: AgentsCatalogDescription;
  inventory: AgentsCatalogInventory;
}>;

/** Compares every field that binds a catalog snapshot to an authenticated Agents session. */
export function isSameAgentsCatalogIdentity(left: AgentsCatalogIdentity, right: AgentsCatalogIdentity): boolean {
  return (
    left.deploymentOrigin === right.deploymentOrigin &&
    left.sessionEpoch === right.sessionEpoch &&
    left.userId === right.userId
  );
}

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

function normalizeAllowedFileTypes(value: unknown, label: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_ALLOWED_FILE_TYPES) {
    throw new AgentsMcpError('contract', `${label} must be a supported string array`);
  }
  const seen = new Set<string>();
  return value.map((item) => {
    const fileType = requireString(item, label, MAX_ALLOWED_FILE_TYPE_LENGTH);
    if (seen.has(fileType)) throw new AgentsMcpError('contract', `${label} contains a duplicate value`);
    seen.add(fileType);
    return fileType;
  });
}

function normalizeSchema(value: unknown, label: string): readonly AgentsSchemaField[] {
  if (!Array.isArray(value) || value.length > MAX_SCHEMA_FIELDS) {
    throw new AgentsMcpError('contract', `${label} must be a supported array`);
  }
  const seenNames = new Set<string>();
  return value.map((item): AgentsSchemaField => {
    if (!isRecord(item)) throw new AgentsMcpError('contract', `${label} field must be an object`);
    const name = requireString(item.name, `${label} field name`, MAX_SCHEMA_FIELD_NAME_LENGTH);
    if (seenNames.has(name)) throw new AgentsMcpError('contract', `${label} contains a duplicate field name`);
    seenNames.add(name);
    if (typeof item.required !== 'boolean') {
      throw new AgentsMcpError('contract', `${label} field required must be a boolean`);
    }
    const allowedFileTypes = normalizeAllowedFileTypes(item.allowed_file_types, `${label} allowed_file_types`);
    return {
      name,
      description:
        item.description === undefined || item.description === null
          ? ''
          : requireString(item.description, `${label} field description`, MAX_AGENT_DESCRIPTION_LENGTH, true),
      type: requireString(item.type, `${label} field type`, MAX_AGENT_TYPE_LENGTH),
      required: item.required,
      ...(allowedFileTypes ? { allowed_file_types: allowedFileTypes } : {}),
    };
  });
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
      throw new AgentsMcpError('ambiguous', 'Agents catalog contains a duplicate agentId');
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

/** Projects the safe inventory and exact supported schema for one candidate in a single validation pass. */
export function normalizeAgentsCatalogSelection(value: unknown, requestedAgentId: string): AgentsCatalogSelection {
  const inventory = normalizeAgentsCatalog(value);
  const index = inventory.agents.findIndex(({ agentId }) => agentId === requestedAgentId);
  if (index < 0) throw new AgentsMcpError('not_found', 'Agent is not in the current catalog');
  const catalogRecord = (value as { agents: unknown[] }).agents[index];
  if (!isRecord(catalogRecord)) throw new AgentsMcpError('contract', 'Agents catalog entry must be an object');
  return {
    inventory,
    description: {
      ...inventory.agents[index],
      inputSchema: normalizeSchema(catalogRecord.defaultInputModes, 'Agents input schema'),
      outputSchema: normalizeSchema(catalogRecord.defaultOutputModes, 'Agents output schema'),
    },
  };
}
