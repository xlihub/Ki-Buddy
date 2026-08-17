import {
  evaluateProductBuiltinResourceState,
  projectProductResources,
  type ProductBuiltinResourceRequirement,
  type ProductBuiltinResourceState,
  type ProductExperience,
  type ProductResourceAccess,
  type ProductResourceHiddenRecord,
  type ProductResourceOrigin,
} from '@/common/platform/ki-buddy';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { requestManagedAgents, type ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { getKiBuddyProductRuntime, getProductExperience } from './kiBuddyRuntime';
import { reportHiddenProductResources } from './kiBuddyProductResourceDiagnostics';

export const KI_CLI_PRODUCT_RESOURCE_ID = '632f31d2';

const getProductBuiltinAgentRequirements = (): readonly ProductBuiltinResourceRequirement[] => {
  const resourceName = getKiBuddyProductRuntime()?.brand.cliName;
  return [
    {
      featureId: 'agents',
      resourceId: KI_CLI_PRODUCT_RESOURCE_ID,
      ...(resourceName ? { resourceName } : {}),
    },
  ];
};

export type ProductAgentCatalogEntry = Readonly<{
  access: Exclude<ProductResourceAccess, 'hidden'>;
  agent: ProductManagedAgent;
  origin: ProductResourceOrigin;
  resourceId: string;
}>;

export type ProductManagedAgent = ManagedAgent &
  Readonly<{
    productAccess: Exclude<ProductResourceAccess, 'hidden'>;
  }>;

export type ProductAgentCatalog = Readonly<{
  entries: readonly ProductAgentCatalogEntry[];
  hiddenResources: readonly ProductResourceHiddenRecord[];
  visibleAgents: readonly ProductManagedAgent[];
}>;

const resolveProductAgentOrigin = (agent: ManagedAgent): ProductResourceOrigin => {
  if (agent.agent_source === 'custom') return 'custom';
  if (agent.agent_source === 'extension' || agent.isExtension === true) return 'extension';
  if (agent.id === KI_CLI_PRODUCT_RESOURCE_ID && agent.agent_source === 'internal' && agent.agent_type === 'aionrs') {
    return 'productBuiltin';
  }
  if (agent.agent_source === 'builtin') return 'upstreamBuiltin';
  return 'unclassified';
};

const toProductAgentResource = (agent: ManagedAgent) => ({
  id: agent.id,
  name: agent.name,
  origin: resolveProductAgentOrigin(agent),
  agent,
});

/** Applies product access to stable Agent IDs plus backend source/type identity. */
export const projectProductAgentCatalog = (
  agents: readonly ManagedAgent[],
  experience: ProductExperience
): ProductAgentCatalog => {
  const projection = projectProductResources(experience, 'agent', agents.map(toProductAgentResource));
  const entries = projection.visible.map(({ resource, access }) => ({
    access,
    agent: { ...resource.agent, productAccess: access },
    origin: resource.origin,
    resourceId: resource.id,
  }));

  return {
    entries,
    hiddenResources: projection.hidden,
    visibleAgents: entries.map(({ agent }) => agent),
  };
};

/** Keeps Assistant candidates only when their stable Agent ID exists in the authoritative projected directory. */
export const projectProductAssistantCandidates = (
  assistants: readonly Assistant[],
  agentCatalog: ProductAgentCatalog
): Assistant[] => {
  const visibleAgentIds = new Set(agentCatalog.entries.map(({ resourceId }) => resourceId));
  const hiddenAssistants = assistants.filter((assistant) => !visibleAgentIds.has(assistant.agent_id));
  reportHiddenProductResources(
    'assistant',
    hiddenAssistants.map((assistant) => ({
      access: 'hidden',
      code: 'product_resource_hidden',
      kind: 'assistant',
      origin: 'unclassified',
      resourceId: assistant.id,
      resourceName: assistant.name,
    }))
  );
  return assistants.filter((assistant) => visibleAgentIds.has(assistant.agent_id));
};

/** Loads and projects the authoritative Agent directory for every renderer consumer. */
export const loadProductAgentCatalog = async (
  experience: ProductExperience = getProductExperience()
): Promise<ProductAgentCatalog> => {
  const catalog = projectProductAgentCatalog(await requestManagedAgents(), experience);
  reportHiddenProductResources('agent', catalog.hiddenResources);
  return catalog;
};

/** Projects Assistant candidates against the same authoritative Agent directory used by settings. */
export const loadProductAssistantCandidates = async (
  assistants: readonly Assistant[],
  experience: ProductExperience = getProductExperience()
): Promise<Assistant[]> => projectProductAssistantCandidates(assistants, await loadProductAgentCatalog(experience));

/** Evaluates the required KiCLI identity after the backend Agent directory is ready. */
export const loadProductBuiltinAgentResourceState = async (
  experience: ProductExperience = getProductExperience(),
  requirements: readonly ProductBuiltinResourceRequirement[] = getProductBuiltinAgentRequirements()
): Promise<ProductBuiltinResourceState> => {
  const pendingState = evaluateProductBuiltinResourceState(experience, 'agent', {
    availableResourceIds: [],
    catalogReady: false,
    requirements,
  });
  if (pendingState.status !== 'pending') return pendingState;

  try {
    const catalog = await loadProductAgentCatalog(experience);
    const availableResourceIds = catalog.entries
      .filter(({ origin }) => origin === 'productBuiltin')
      .map(({ resourceId }) => resourceId);
    return evaluateProductBuiltinResourceState(experience, 'agent', {
      availableResourceIds,
      catalogReady: true,
      requirements,
    });
  } catch (error) {
    console.error('[ProductExperience] Failed to load the Agent catalog for product integrity validation', error);
    return pendingState;
  }
};
