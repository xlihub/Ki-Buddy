import { describe, expect, it } from 'vitest';
import {
  createAionUiProductExperience,
  createKiBuddyProductExperience,
  parseProductExperiencePolicy,
} from '@/common/platform/ki-buddy/productExperience';

const validPolicy = {
  schemaVersion: 1,
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
      productBuiltin: 'use',
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
} as const;

describe('ProductExperience interface', () => {
  it('keeps the complete AionUi feature and resource behavior when no product capability exists', () => {
    const experience = createAionUiProductExperience();

    expect(experience.featureState('team')).toBe('enabled');
    expect(experience.resourceAccess('assistant', 'upstreamBuiltin')).toBe('manage');
    expect(experience.behaviorDefaults()).toEqual({
      scheduledTaskExecutor: 'assistant-or-team',
      autoInjectedSkillExclusions: [],
    });
  });

  it('provides feature, resource, and behavior decisions without exposing the product JSON', () => {
    const experience = createKiBuddyProductExperience(validPolicy);

    expect(experience.featureState('team')).toBe('disabled');
    expect(experience.featureState('scheduledTasks')).toBe('enabled');
    expect(experience.resourceAccess('assistant', 'productBuiltin')).toBe('use');
    expect(experience.resourceAccess('assistant', 'custom')).toBe('manage');
    expect(experience.behaviorDefaults()).toEqual({
      scheduledTaskExecutor: 'assistant',
      autoInjectedSkillExclusions: ['aionui-config'],
    });
    expect(experience).not.toHaveProperty('features');
    expect(experience).not.toHaveProperty('resources');
  });

  it('returns a deeply immutable serializable snapshot', () => {
    const snapshot = parseProductExperiencePolicy(validPolicy);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.features)).toBe(true);
    expect(Object.isFrozen(snapshot.resources.assistant)).toBe(true);
    expect(Object.isFrozen(snapshot.behaviorDefaults.autoInjectedSkillExclusions)).toBe(true);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(validPolicy);
  });

  it.each([
    {
      name: 'missing feature',
      policy: {
        ...validPolicy,
        features: Object.fromEntries(Object.entries(validPolicy.features).filter(([id]) => id !== 'team')),
      },
    },
    {
      name: 'unknown feature',
      policy: { ...validPolicy, features: { ...validPolicy.features, secretFeature: 'enabled' } },
    },
    {
      name: 'unknown feature state',
      policy: { ...validPolicy, features: { ...validPolicy.features, team: 'preview' } },
    },
    {
      name: 'unknown resource field',
      policy: {
        ...validPolicy,
        resources: {
          ...validPolicy.resources,
          assistant: { ...validPolicy.resources.assistant, remote: 'use' },
        },
      },
    },
    {
      name: 'unknown resource state',
      policy: {
        ...validPolicy,
        resources: {
          ...validPolicy.resources,
          assistant: { ...validPolicy.resources.assistant, custom: 'read' },
        },
      },
    },
    {
      name: 'unknown policy field',
      policy: { ...validPolicy, rollout: 'remote' },
    },
  ])('rejects an incomplete or unknown $name', ({ policy }) => {
    expect(() => parseProductExperiencePolicy(policy)).toThrow();
  });

  it('rejects enabled child features when their parent feature is disabled', () => {
    expect(() =>
      parseProductExperiencePolicy({
        ...validPolicy,
        features: {
          ...validPolicy.features,
          extensionRuntime: 'disabled',
          extensionMarketplace: 'enabled',
        },
      })
    ).toThrow('extensionMarketplace');
  });
});
