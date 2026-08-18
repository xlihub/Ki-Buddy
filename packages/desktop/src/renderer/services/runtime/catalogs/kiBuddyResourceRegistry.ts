import type { ProductFeatureId } from '@/common/platform/ki-buddy';

type ProductResourceDefinition = Readonly<{
  featureId: ProductFeatureId;
  id: string;
  resourceName?: string;
}>;

const KI_CLI_AGENT = {
  id: '632f31d2',
  featureId: 'agents',
  resourceName: 'Ki CLI',
  agentSource: 'internal',
  agentType: 'aionrs',
} as const satisfies ProductResourceDefinition & { agentSource: string; agentType: string };

/** Stable product-owned identities used by every Agent, Assistant, Skill, and MCP catalog projection. */
export const KI_BUDDY_PRODUCT_RESOURCE_REGISTRY = {
  agent: {
    kiCli: KI_CLI_AGENT,
  },
  assistant: {
    word: {
      id: 'word-creator',
      featureId: 'assistants',
      resourceName: 'Word Creator',
      source: 'builtin',
    },
    presentation: {
      id: 'ppt-creator',
      featureId: 'assistants',
      resourceName: 'PPT Creator',
      source: 'builtin',
    },
    spreadsheet: {
      id: 'excel-creator',
      featureId: 'assistants',
      resourceName: 'Excel Creator',
      source: 'builtin',
    },
    kiCli: {
      id: `bare:${KI_CLI_AGENT.id}`,
      featureId: 'assistants',
      resourceName: KI_CLI_AGENT.resourceName,
      source: 'generated',
      agentId: KI_CLI_AGENT.id,
      agentSource: KI_CLI_AGENT.agentSource,
      agentType: KI_CLI_AGENT.agentType,
    },
  },
  skill: {
    word: {
      id: 'builtin:officecli-docx',
      featureId: 'skills',
      backendName: 'officecli-docx',
    },
    presentation: {
      id: 'builtin:officecli-pptx',
      featureId: 'skills',
      backendName: 'officecli-pptx',
    },
    spreadsheet: {
      id: 'builtin:officecli-xlsx',
      featureId: 'skills',
      backendName: 'officecli-xlsx',
    },
  },
  mcp: {},
} as const;

export const KI_CLI_PRODUCT_RESOURCE_ID = KI_BUDDY_PRODUCT_RESOURCE_REGISTRY.agent.kiCli.id;
export const KI_BUDDY_ASSISTANT_IDENTITIES = KI_BUDDY_PRODUCT_RESOURCE_REGISTRY.assistant;
export const KI_BUDDY_PRODUCT_ASSISTANT_IDS = Object.values(KI_BUDDY_ASSISTANT_IDENTITIES).map(({ id }) => id);
export const KI_BUDDY_PRODUCT_SKILL_NAMES = new Set<string>(
  Object.values(KI_BUDDY_PRODUCT_RESOURCE_REGISTRY.skill).map(({ backendName }) => backendName)
);
