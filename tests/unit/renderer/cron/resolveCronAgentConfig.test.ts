/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { Assistant, AssistantAgent } from '@/common/types/agent/assistantTypes';
import { resolveCronAgentConfig } from '@/renderer/pages/cron/ScheduledTasksPage/resolveCronAgentConfig';
import { KI_BUDDY_PRODUCT_RESOURCE_REGISTRY } from '@/renderer/services/runtime/catalogs/kiBuddyResourceRegistry';

describe('resolveCronAgentConfig', () => {
  it('stores provider id for preset aionrs assistants instead of literal aionrs backend', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'assistant-1',
      ...emptyCapabilitySnapshot(),
      presetAssistants: [
        assistant({
          id: 'assistant-1',
          name: '文件规划助手',
          agent_id: 'agent-aionrs',
          agent: agent('agent-aionrs', 'aionrs'),
        }),
      ],
      selectedAionrsProvider: {
        id: 'provider-gemini',
        name: 'Gemini',
      },
      model_id: 'gemini-3.1-pro-preview',
      workspace: '/tmp/project',
      getMode: () => 'yolo',
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result).toEqual({
      agent_config: {
        ...emptyCronCapabilitySnapshot(),
        name: '文件规划助手',
        assistant_id: 'assistant-1',
        mode: 'yolo',
        model_id: 'gemini-3.1-pro-preview',
        model: {
          provider_id: 'provider-gemini',
          model: 'gemini-3.1-pro-preview',
          use_model: 'gemini-3.1-pro-preview',
        },
        config_options: undefined,
        workspace: '/tmp/project',
      },
    });
  });

  it('keeps preset acp assistants on their backend slug', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'assistant-2',
      ...emptyCapabilitySnapshot(),
      presetAssistants: [
        assistant({
          id: 'assistant-2',
          name: 'Codex 助手',
          agent_id: 'agent-codex',
          agent: agent('agent-codex', 'acp', 'codex'),
        }),
      ],
      config_options: { reasoning_effort: 'high' },
      getMode: (selectedAssistant) => (selectedAssistant.agent_id === 'agent-codex' ? 'full-access' : 'yolo'),
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result).toEqual({
      agent_config: {
        ...emptyCronCapabilitySnapshot(),
        name: 'Codex 助手',
        assistant_id: 'assistant-2',
        mode: 'full-access',
        config_options: { reasoning_effort: 'high' },
        model_id: undefined,
        workspace: undefined,
      },
    });
  });

  it('stores localized assistant names when a locale key is provided', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'assistant-2',
      ...emptyCapabilitySnapshot(),
      presetAssistants: [
        assistant({
          id: 'assistant-2',
          name: 'Codex',
          name_i18n: { 'zh-CN': '代码助手' },
          agent_id: 'agent-codex',
          agent: agent('agent-codex', 'acp', 'codex'),
        }),
      ],
      localeKey: 'zh-CN',
      getMode: () => 'full-access',
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result.agent_config?.name).toBe('代码助手');
  });

  it('omits backend for non-aionrs assistants and lets the backend derive runtime identity', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'assistant-4',
      ...emptyCapabilitySnapshot(),
      presetAssistants: [
        assistant({
          id: 'assistant-4',
          name: 'Claude 助手',
          agent_id: 'agent-claude',
          agent: agent('agent-claude', 'acp', 'claude'),
        }),
      ],
      getMode: () => 'default',
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result).toEqual({
      agent_config: {
        ...emptyCronCapabilitySnapshot(),
        name: 'Claude 助手',
        assistant_id: 'assistant-4',
        mode: 'default',
        model_id: undefined,
        config_options: undefined,
        workspace: undefined,
      },
    });
    expect(result.agent_config).not.toHaveProperty('backend');
  });

  it('does not write legacy custom_agent_id for new preset cron jobs', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'assistant-3',
      ...emptyCapabilitySnapshot(),
      presetAssistants: [
        assistant({
          id: 'assistant-3',
          name: '社媒发布助手',
          agent_id: 'agent-claude',
          agent: agent('agent-claude', 'acp', 'claude'),
        }),
      ],
      getMode: () => 'default',
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result.agent_config).toBeDefined();
    expect(result.agent_config).not.toHaveProperty('custom_agent_id');
    expect(result.agent_config).not.toHaveProperty('preset_agent_type');
    expect(result.agent_config).not.toHaveProperty('is_preset');
  });

  it('stores the effective capability snapshot for the Ki-Buddy Agents execution assistant', () => {
    const assistantDefinition = KI_BUDDY_PRODUCT_RESOURCE_REGISTRY.assistant.agentsExecution;
    const result = resolveCronAgentConfig({
      agentValue: assistantDefinition.id,
      presetAssistants: [
        assistant({
          id: assistantDefinition.id,
          source: assistantDefinition.source,
          name: 'Agents 执行助手',
          agent_id: 'agent-aionrs',
          agent: agent('agent-aionrs', 'aionrs'),
        }),
      ],
      skillIds: ['ki-buddy-agents-execution'],
      disabledBuiltinSkillIds: ['legacy-builtin'],
      mcpIds: ['agents-adapter-current-user'],
      excludeAutoInjectSkills: ['aionui-config'],
      selectedAionrsProvider: {
        id: 'provider-minimax',
        name: 'MiniMax',
      },
      model_id: 'MiniMax-M3',
      getMode: () => 'yolo',
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result.agent_config).toMatchObject({
      skill_ids: ['ki-buddy-agents-execution'],
      disabled_builtin_skill_ids: ['legacy-builtin'],
      mcp_ids: ['agents-adapter-current-user'],
      exclude_auto_inject_skills: ['aionui-config'],
    });
  });

  it('preserves an explicitly empty capability snapshot', () => {
    const result = resolveCronAgentConfig({
      agentValue: 'assistant-1',
      presetAssistants: [assistant({ id: 'assistant-1', name: 'General Assistant', agent_id: 'agent-1' })],
      skillIds: [],
      disabledBuiltinSkillIds: [],
      mcpIds: [],
      excludeAutoInjectSkills: [],
      getMode: () => 'default',
      aionrsModelRequiredMessage: 'provider required',
    });

    expect(result.agent_config).toMatchObject({
      skill_ids: [],
      disabled_builtin_skill_ids: [],
      mcp_ids: [],
      exclude_auto_inject_skills: [],
    });
  });

  it('throws when the selected assistant cannot be resolved', () => {
    expect(() =>
      resolveCronAgentConfig({
        agentValue: 'missing-assistant',
        ...emptyCapabilitySnapshot(),
        presetAssistants: [],
        getMode: () => 'default',
        aionrsModelRequiredMessage: 'provider required',
      })
    ).toThrowError('assistant_id is required');
  });
});

function emptyCapabilitySnapshot() {
  return {
    skillIds: [],
    disabledBuiltinSkillIds: [],
    mcpIds: [],
    excludeAutoInjectSkills: [],
  };
}

function emptyCronCapabilitySnapshot() {
  return {
    skill_ids: [],
    disabled_builtin_skill_ids: [],
    mcp_ids: [],
    exclude_auto_inject_skills: [],
  };
}

function assistant(overrides: Partial<Assistant> & Pick<Assistant, 'id' | 'name' | 'agent_id'>): Assistant {
  return {
    id: overrides.id,
    source: 'user',
    name: overrides.name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 0,
    agent_id: overrides.agent_id,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    ...overrides,
  };
}

function agent(_id: string, type: string, backend?: string): AssistantAgent {
  return {
    type,
    source: type === 'aionrs' ? 'internal' : 'builtin',
    acp_backend: backend,
  };
}
