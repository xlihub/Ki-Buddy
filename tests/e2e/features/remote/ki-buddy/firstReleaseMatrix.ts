/**
 * Approved Ki-Buddy v1 launch matrix.
 *
 * This file is deliberately independent from ki-buddy-product.json and the
 * runtime registry. Those files are test inputs; importing either here would
 * let a bad policy change its own expected result.
 */
export const FIRST_RELEASE_MATRIX = {
  features: {
    account: 'enabled',
    agents: 'enabled',
    appearance: 'enabled',
    assistants: 'enabled',
    channels: 'disabled',
    componentShowcase: 'disabled',
    conversation: 'enabled',
    desktopPet: 'disabled',
    extensionMarketplace: 'disabled',
    extensionRuntime: 'disabled',
    extensionSettings: 'disabled',
    guid: 'enabled',
    guidFeedback: 'disabled',
    guidGithubStar: 'disabled',
    guidWebUi: 'disabled',
    models: 'enabled',
    scheduledTasks: 'enabled',
    skills: 'enabled',
    system: 'enabled',
    team: 'disabled',
    themeCustomEditor: 'disabled',
    themeMarketplace: 'disabled',
    themePresets: 'disabled',
    tools: 'enabled',
    webUi: 'disabled',
  },
  resources: {
    agent: {
      productBuiltin: 'use',
      upstreamBuiltin: 'hidden',
      custom: 'manage',
      extension: 'hidden',
      unclassified: 'hidden',
    },
    assistant: {
      productBuiltin: 'manage',
      upstreamBuiltin: 'hidden',
      custom: 'manage',
      extension: 'hidden',
      unclassified: 'hidden',
    },
    model: {
      productBuiltin: 'manage',
      upstreamBuiltin: 'manage',
      custom: 'manage',
      extension: 'hidden',
      unclassified: 'hidden',
    },
    skill: {
      productBuiltin: 'use',
      upstreamBuiltin: 'hidden',
      custom: 'manage',
      extension: 'hidden',
      unclassified: 'hidden',
    },
    mcp: {
      productBuiltin: 'use',
      upstreamBuiltin: 'hidden',
      custom: 'manage',
      extension: 'hidden',
      unclassified: 'hidden',
    },
  },
  behaviorDefaults: {
    scheduledTaskExecutor: 'assistant',
    autoInjectedSkillExclusions: ['aionui-config'],
  },
  workspaceEntries: ['newConversation', 'assistants', 'scheduledTasks'],
  settingsEntries: ['account', 'agent', 'model', 'skills', 'tools', 'appearance', 'system', 'archived', 'about'],
  disabledWorkspaceRoutes: ['/team/e2e-disabled', '/test/components'],
  disabledSettingsRoutes: ['/settings/webui', '/settings/pet', '/settings/ext/e2e-disabled'],
  disabledFeatureEvidence: {
    flashObserved: {
      channels: ['[data-webui-tab="channels"]'],
      desktopPet: ['[data-settings-id="pet"]'],
      extensionRuntime: ['[data-testid="extension-skills-section"]'],
      extensionSettings: ['[data-settings-path^="ext/"]'],
      guidFeedback: ['[data-product-feature="guidFeedback"]'],
      guidGithubStar: ['[data-product-feature="guidGithubStar"]'],
      guidWebUi: ['[data-product-feature="guidWebUi"]'],
      team: ['[data-testid="team-section-toggle"]', '[data-testid="team-create-btn"]'],
      themeCustomEditor: ['[data-product-features~="themeCustomEditor"]'],
      themeMarketplace: ['[data-product-features~="themeMarketplace"]'],
      themePresets: ['[data-product-features~="themePresets"]'],
      webUi: ['[data-settings-id="webui"]'],
    },
    routeOnly: {
      componentShowcase: ['/test/components'],
    },
    runtimeOnly: {
      extensionMarketplace: ['extensions.get-loaded-extensions'],
    },
  },
  productResources: {
    agents: ['632f31d2'],
    assistants: ['word-creator', 'ppt-creator', 'excel-creator', 'bare:632f31d2'],
    skills: ['officecli-docx', 'officecli-pptx', 'officecli-xlsx'],
    mcp: [],
  },
} as const;
