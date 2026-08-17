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
