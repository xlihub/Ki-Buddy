import type { TChatConversation, TConversationAssistantIdentity } from '@/common/config/storage';
import type { ProductExperience, ProductResourceOrigin } from '@/common/platform/ki-buddy';
import type { Assistant } from '@/common/types/agent/assistantTypes';

type AssistantOriginIdentity = Readonly<{
  id: string;
  source: string;
}>;

export type ConversationRuntimeAccess = 'allowed' | 'blocked' | 'pending';

export type KiBuddyConversationRuntimeAccessInput = Readonly<{
  assistantCatalog: Readonly<{
    matchedAssistant: Assistant | undefined;
    requiresClassification: boolean;
    status: 'loading' | 'ready';
  }>;
  conversation: TChatConversation | undefined;
}>;

export const KI_CLI_PRODUCT_RESOURCE_ID = '632f31d2';

export const KI_BUDDY_ASSISTANT_IDENTITIES = {
  word: {
    assistantId: 'word-creator',
    assistantSource: 'builtin',
    resourceName: 'Word Creator',
  },
  presentation: {
    assistantId: 'ppt-creator',
    assistantSource: 'builtin',
    resourceName: 'PPT Creator',
  },
  spreadsheet: {
    assistantId: 'excel-creator',
    assistantSource: 'builtin',
    resourceName: 'Excel Creator',
  },
  kiCli: {
    assistantId: `bare:${KI_CLI_PRODUCT_RESOURCE_ID}`,
    assistantSource: 'generated',
    resourceName: 'Ki CLI',
    agentId: KI_CLI_PRODUCT_RESOURCE_ID,
    agentType: 'aionrs',
    agentSource: 'internal',
  },
} as const;

export const KI_BUDDY_PRODUCT_ASSISTANT_IDS = Object.values(KI_BUDDY_ASSISTANT_IDENTITIES).map(
  ({ assistantId }) => assistantId
);

/** Identifies the product-owned internal CLI across current and historical snapshot IDs. */
export function isKiCliConversationAssistant(assistant: TConversationAssistantIdentity): boolean {
  return (
    assistant.backend === 'aionrs' &&
    assistant.source === 'generated' &&
    (assistant.id === KI_BUDDY_ASSISTANT_IDENTITIES.kiCli.assistantId ||
      assistant.id === 'bare-aionrs' ||
      assistant.id === 'aionrs')
  );
}

/** Resolves an Assistant's stable identity to the shared product resource origin. */
export function resolveKiBuddyAssistantOrigin(assistant: AssistantOriginIdentity): ProductResourceOrigin {
  if (assistant.source === 'extension') return 'extension';
  if (assistant.source === 'user') return 'custom';
  if (
    Object.values(KI_BUDDY_ASSISTANT_IDENTITIES).some(
      (identity) => assistant.id === identity.assistantId && assistant.source === identity.assistantSource
    )
  ) {
    return 'productBuiltin';
  }
  if (assistant.source === 'builtin') return 'upstreamBuiltin';
  return 'unclassified';
}

/** Resolves a persisted conversation Assistant snapshot, including historical Ki CLI identities. */
export function resolveKiBuddyConversationAssistantOrigin(
  assistant: TConversationAssistantIdentity
): ProductResourceOrigin {
  return isKiCliConversationAssistant(assistant) ? 'productBuiltin' : resolveKiBuddyAssistantOrigin(assistant);
}

function readConversationString(extra: TChatConversation['extra'], key: string): string {
  const value = (extra as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function hasExtensionRuntimeIdentity(conversation: TChatConversation): boolean {
  const identities = [
    conversation.assistant?.id,
    conversation.assistant?.backend,
    readConversationString(conversation.extra, 'assistant_id'),
    readConversationString(conversation.extra, 'preset_assistant_id'),
    readConversationString(conversation.extra, 'custom_agent_id'),
    readConversationString(conversation.extra, 'backend'),
  ];
  return conversation.assistant?.source === 'extension' || identities.some((identity) => identity?.startsWith('ext:'));
}

/** Resolves whether a persisted conversation may mount its runtime under the Ki-Buddy product policy. */
export function resolveKiBuddyConversationRuntimeAccess(
  input: KiBuddyConversationRuntimeAccessInput,
  experience: ProductExperience
): ConversationRuntimeAccess {
  const { conversation, assistantCatalog } = input;
  if (!conversation || experience.featureState('extensionRuntime') === 'enabled') return 'allowed';
  if (hasExtensionRuntimeIdentity(conversation)) return 'blocked';

  if (
    assistantCatalog.matchedAssistant?.agent?.source === 'extension' ||
    (assistantCatalog.matchedAssistant &&
      resolveKiBuddyAssistantOrigin(assistantCatalog.matchedAssistant) === 'extension')
  ) {
    return 'blocked';
  }

  if (!assistantCatalog.requiresClassification) return 'allowed';
  return assistantCatalog.status === 'loading' ? 'pending' : 'allowed';
}
