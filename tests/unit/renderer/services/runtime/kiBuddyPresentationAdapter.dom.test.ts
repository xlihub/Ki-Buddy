import { beforeEach, describe, expect, it } from 'vitest';
import { KI_BUDDY_PRODUCT_CAPABILITY } from '@/common/platform/ki-buddy';
import {
  adaptProductAgentIdentity,
  adaptProductAssistantIdentity,
  adaptProductConversationAssistantIdentity,
} from '@/renderer/services/runtime/productBrandRuntime';

describe('Ki-Buddy product presentation adapter', () => {
  beforeEach(() => {
    window.__kiBuddyProductPresentation = KI_BUDDY_PRODUCT_CAPABILITY;
  });

  it('projects the internal CLI agent to the product identity', () => {
    const agent = adaptProductAgentIdentity({
      agent_type: 'aionrs',
      agent_source: 'internal',
      name: 'Aion CLI',
      icon: '/api/assets/logos/aionui.svg',
    });

    expect(agent.name).toBe('Ki CLI');
    expect(agent.icon).toMatch(/^data:image\/png;base64,/);
    expect(agent.avatar).toMatch(/^data:image\/png;base64,/);
  });

  it('projects only the generated internal CLI assistant', () => {
    const assistant = adaptProductAssistantIdentity({
      id: 'bare:agent-aionrs',
      source: 'generated',
      agent: { type: 'aionrs', source: 'internal' },
      avatar: '/api/assets/logos/aionui.svg',
      name: 'Aion CLI',
      name_i18n: { 'en-US': 'Aion CLI' },
    });

    expect(assistant.name).toBe('Ki CLI');
    expect(assistant.name_i18n).toEqual({ 'en-US': 'Ki CLI' });
    expect(assistant.avatar).toMatch(/^data:image\/png;base64,/);
  });

  it('preserves official assistant names and avatars', () => {
    const assistant = {
      id: 'builtin-word',
      source: 'builtin' as const,
      agent: { type: 'aionrs', source: 'internal' },
      avatar: '/api/assistants/builtin-word/avatar',
      name: 'Word Assistant',
      name_i18n: { 'zh-CN': '文档助手' },
    };

    expect(adaptProductAssistantIdentity(assistant)).toEqual(assistant);
  });

  it('preserves user assistant identities on the internal backend', () => {
    const assistant = {
      id: 'research-assistant',
      source: 'user' as const,
      agent: { type: 'aionrs', source: 'internal' },
      avatar: '🔬',
      name: 'Research Assistant',
      name_i18n: {},
    };

    expect(adaptProductAssistantIdentity(assistant)).toEqual(assistant);
  });

  it('upgrades a legacy internal CLI conversation snapshot', () => {
    const assistant = adaptProductConversationAssistantIdentity({
      id: 'bare-aionrs',
      source: 'generated',
      name: 'Aion CLI',
      avatar: '/api/assets/logos/aionui.svg',
      backend: 'aionrs',
    });

    expect(assistant.name).toBe('Ki CLI');
    expect(assistant.avatar).toMatch(/^data:image\/png;base64,/);
  });

  it('keeps a non-product conversation snapshot unchanged', () => {
    const assistant = {
      id: 'research-assistant',
      source: 'generated',
      name: 'Research Assistant',
      avatar: '🔬',
      backend: 'aionrs',
    } as const;

    expect(adaptProductConversationAssistantIdentity(assistant)).toEqual(assistant);
  });

  it('does not infer the internal CLI from a user assistant name', () => {
    const assistant = {
      id: 'custom-aion-cli',
      source: 'user',
      name: 'Aion CLI',
      avatar: '🧪',
      backend: 'aionrs',
    } as const;

    expect(adaptProductConversationAssistantIdentity(assistant)).toEqual(assistant);
  });
});
