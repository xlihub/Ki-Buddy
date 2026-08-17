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
import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { getProductExperience } from '../kiBuddyRuntime';
import { KI_BUDDY_ASSISTANT_IDENTITIES } from './kiBuddyAssistantIdentity';

export { KI_BUDDY_PRODUCT_ASSISTANT_IDS } from './kiBuddyAssistantIdentity';

const PRODUCT_OFFICIAL_ASSISTANT_IDS = new Set<string>(
  Object.values(KI_BUDDY_ASSISTANT_IDENTITIES)
    .filter(({ assistantSource }) => assistantSource === 'builtin')
    .map(({ assistantId }) => assistantId)
);
const KI_CLI_ASSISTANT_IDENTITY = KI_BUDDY_ASSISTANT_IDENTITIES.kiCli;

const PRODUCT_BUILTIN_ASSISTANT_REQUIREMENTS: readonly ProductBuiltinResourceRequirement[] = Object.values(
  KI_BUDDY_ASSISTANT_IDENTITIES
).map(({ assistantId, resourceName }) => ({
  featureId: 'assistants',
  resourceId: assistantId,
  resourceName,
}));

export type ProductAssistant = Assistant &
  Readonly<{
    productAccess: Exclude<ProductResourceAccess, 'hidden'>;
  }>;

export type ProductAssistantCatalogEntry = Readonly<{
  access: Exclude<ProductResourceAccess, 'hidden'>;
  assistant: ProductAssistant;
  origin: ProductResourceOrigin;
  resourceId: string;
}>;

export type ProductAssistantCatalog = Readonly<{
  entries: readonly ProductAssistantCatalogEntry[];
  hiddenResources: readonly ProductResourceHiddenRecord[];
  visibleAssistants: readonly ProductAssistant[];
}>;

const isKiCliAssistant = (assistant: Assistant): boolean =>
  assistant.id === KI_CLI_ASSISTANT_IDENTITY.assistantId &&
  assistant.source === KI_CLI_ASSISTANT_IDENTITY.assistantSource &&
  assistant.agent_id === KI_CLI_ASSISTANT_IDENTITY.agentId &&
  assistant.agent?.type === KI_CLI_ASSISTANT_IDENTITY.agentType &&
  assistant.agent.source === KI_CLI_ASSISTANT_IDENTITY.agentSource;

const resolveProductAssistantOrigin = (assistant: Assistant): ProductResourceOrigin => {
  if (assistant.agent?.source === 'extension') return 'extension';
  if (assistant.source === 'user') return 'custom';
  if (assistant.source === 'builtin') {
    return PRODUCT_OFFICIAL_ASSISTANT_IDS.has(assistant.id) ? 'productBuiltin' : 'upstreamBuiltin';
  }
  if (isKiCliAssistant(assistant)) return 'productBuiltin';
  return 'unclassified';
};

/** Applies product access from stable Assistant identity and structured source fields. */
export const projectProductAssistantCatalog = (
  assistants: readonly Assistant[],
  experience: ProductExperience
): ProductAssistantCatalog => {
  const projection = projectProductResources(
    experience,
    'assistant',
    assistants.map((assistant) => ({
      id: assistant.id,
      name: assistant.name,
      origin: resolveProductAssistantOrigin(assistant),
      assistant,
    }))
  );
  const entries = projection.visible.map(({ resource, access }) => ({
    access,
    assistant: { ...resource.assistant, productAccess: access },
    origin: resource.origin,
    resourceId: resource.id,
  }));

  return {
    entries,
    hiddenResources: projection.hidden,
    visibleAssistants: entries.map(({ assistant }) => assistant),
  };
};

/** Evaluates every required Assistant only after the backend catalog becomes authoritative. */
export const loadProductBuiltinAssistantResourceState = async (
  experience: ProductExperience = getProductExperience(),
  requirements: readonly ProductBuiltinResourceRequirement[] = PRODUCT_BUILTIN_ASSISTANT_REQUIREMENTS
): Promise<ProductBuiltinResourceState> => {
  const pendingState = evaluateProductBuiltinResourceState(experience, 'assistant', {
    availableResourceIds: [],
    catalogReady: false,
    requirements,
  });
  if (pendingState.status !== 'pending') return pendingState;

  try {
    const catalog = projectProductAssistantCatalog(await ipcBridge.assistants.list.invoke(), experience);
    const availableResourceIds = catalog.entries
      .filter(({ origin }) => origin === 'productBuiltin')
      .map(({ resourceId }) => resourceId);
    return evaluateProductBuiltinResourceState(experience, 'assistant', {
      availableResourceIds,
      catalogReady: true,
      requirements,
    });
  } catch (error) {
    console.error('[ProductExperience] Failed to load the Assistant catalog for product integrity validation', error);
    return pendingState;
  }
};
