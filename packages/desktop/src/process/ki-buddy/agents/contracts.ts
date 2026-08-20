import { normalizeAgentsBaseUrl } from '@/common/platform/ki-buddy/deploymentUrl';
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
const MAX_INVOKE_TEXT_LENGTH = 5 * 1024 * 1024;
const AGENTS_INVOKE_CONTROL_FIELDS = new Set(['apiKey', 'userId', 'flowId', 'oauthToken', 'baseUrlOverride']);

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

export type AgentsInvokeGrant = Readonly<{
  agentId: string;
  identity: AgentsCatalogIdentity;
}>;

export type AgentsAuthorizedDescription = Readonly<{
  description: AgentsCatalogDescription;
  grant: AgentsInvokeGrant;
}>;

export type AgentsScalarInput = boolean | number | string;
export type AgentsScalarInputs = Readonly<Record<string, AgentsScalarInput>>;

export type AgentsInvokeCorrelation = Readonly<{
  agentId: string;
  taskId?: string;
  requestId?: string;
}>;

export type AgentsInvokeResult = Readonly<{
  agentId: string;
  taskId: string;
  requestId: string;
  text: string;
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

/** Validates the complete identity that binds catalog data to an authenticated Agents session. */
export function normalizeAgentsCatalogIdentity(value: unknown): AgentsCatalogIdentity {
  if (
    !isRecord(value) ||
    typeof value.deploymentOrigin !== 'string' ||
    !Number.isSafeInteger(value.sessionEpoch) ||
    (value.sessionEpoch as number) < 0 ||
    typeof value.userId !== 'string'
  ) {
    throw new AgentsMcpError('contract', 'Agents catalog identity is incompatible');
  }
  const deploymentOrigin = normalizeAgentsBaseUrl(value.deploymentOrigin);
  if (!deploymentOrigin || new URL(deploymentOrigin).origin !== deploymentOrigin) {
    throw new AgentsMcpError('contract', 'Agents catalog deployment origin is incompatible');
  }
  const userId = value.userId.trim();
  if (!userId || userId.length > MAX_AGENT_ID_LENGTH) {
    throw new AgentsMcpError('contract', 'Agents catalog user identity is incompatible');
  }
  return { deploymentOrigin, sessionEpoch: value.sessionEpoch as number, userId };
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

function validateScalarValue(field: AgentsSchemaField, value: unknown): value is AgentsScalarInput {
  switch (field.type.toLowerCase()) {
    case 'text':
    case 'string':
    case 'date':
    case 'datetime':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return false;
  }
}

function normalizeOptionalInvokeCorrelation(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, label, MAX_AGENT_ID_LENGTH);
}

/** Validates one model-provided input object against the freshly fetched exact scalar schema. */
export function validateAgentsScalarInputs(description: AgentsCatalogDescription, value: unknown): AgentsScalarInputs {
  if (!isRecord(value)) throw new AgentsMcpError('invalid_input', 'Agents invoke inputs must be an object');
  const schemaByName = new Map(description.inputSchema.map((field) => [field.name, field]));
  const entries = Object.entries(value);
  if (entries.length > description.inputSchema.length) {
    throw new AgentsMcpError('invalid_input', 'Agents invoke inputs contain fields outside the exact schema');
  }

  const normalizedEntries: Array<[string, AgentsScalarInput]> = [];
  for (const [name, input] of entries) {
    const field = schemaByName.get(name);
    if (!field || AGENTS_INVOKE_CONTROL_FIELDS.has(name)) {
      throw new AgentsMcpError('invalid_input', 'Agents invoke inputs contain a forbidden field');
    }
    if (!validateScalarValue(field, input)) {
      throw new AgentsMcpError('invalid_input', 'Agents invoke input does not match the exact scalar schema');
    }
    normalizedEntries.push([name, input]);
  }

  const normalized = Object.fromEntries(normalizedEntries) as Record<string, AgentsScalarInput>;

  for (const field of description.inputSchema) {
    const input = normalized[field.name];
    if (field.required && (input === undefined || (typeof input === 'string' && input.trim().length === 0))) {
      throw new AgentsMcpError('invalid_input', 'Agents invoke is missing a required scalar input');
    }
  }
  return normalized;
}

/** Projects a successful Gateway invoke response into the only envelope exposed to the model. */
export function normalizeAgentsInvokeResponse(value: unknown, agentId: string): AgentsInvokeResult {
  if (!isRecord(value)) throw new AgentsMcpError('contract', 'Agents invoke response has an invalid envelope');
  const status = typeof value.status === 'string' ? value.status.trim().toLowerCase() : '';
  if (status === 'failed' || status === 'error') {
    let taskId: string | undefined;
    let requestId: string | undefined;
    let contractError: AgentsMcpError | undefined;
    try {
      taskId = normalizeOptionalInvokeCorrelation(value.flow_instance_id, 'Agents invoke flow_instance_id');
    } catch (error) {
      contractError = error as AgentsMcpError;
    }
    try {
      requestId = normalizeOptionalInvokeCorrelation(value.request_id, 'Agents invoke request_id');
    } catch (error) {
      contractError ??= error as AgentsMcpError;
    }
    const correlation = {
      agentId,
      ...(taskId ? { taskId } : {}),
      ...(requestId ? { requestId } : {}),
    };
    if (contractError) {
      throw new AgentsMcpError('contract', contractError.message, correlation);
    }
    throw new AgentsMcpError('invoke_failed', 'Agents invoke failed', {
      ...correlation,
    });
  }
  if (!['completed', 'success', 'ok'].includes(status)) {
    throw new AgentsMcpError('contract', 'Agents invoke response has an unsupported status');
  }
  const taskId = requireString(value.flow_instance_id, 'Agents invoke flow_instance_id', MAX_AGENT_ID_LENGTH);
  const requestId = requireString(value.request_id, 'Agents invoke request_id', MAX_AGENT_ID_LENGTH);
  if (!isRecord(value.result)) throw new AgentsMcpError('contract', 'Agents invoke result must be an object');
  const rawText = typeof value.result.text === 'string' ? value.result.text : value.result.message;
  const text = requireString(rawText, 'Agents invoke result text', MAX_INVOKE_TEXT_LENGTH, true);
  return { agentId, taskId, requestId, text };
}

/** Validates the safe loopback Bridge result without rewriting its agent association. */
export function normalizeAgentsBridgeInvokeResult(value: unknown, expectedAgentId: string): AgentsInvokeResult {
  if (!isRecord(value) || value.agentId !== expectedAgentId) {
    throw new AgentsMcpError('contract', 'Agents invoke Bridge result agentId is incompatible');
  }
  return {
    agentId: expectedAgentId,
    taskId: requireString(value.taskId, 'Agents invoke Bridge taskId', MAX_AGENT_ID_LENGTH),
    requestId: requireString(value.requestId, 'Agents invoke Bridge requestId', MAX_AGENT_ID_LENGTH),
    text: requireString(value.text, 'Agents invoke Bridge text', MAX_INVOKE_TEXT_LENGTH, true),
  };
}
