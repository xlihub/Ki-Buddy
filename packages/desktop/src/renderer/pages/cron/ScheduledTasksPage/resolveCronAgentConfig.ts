/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronAgentConfigWrite } from '@/common/adapter/ipcBridge';
import { isAionrsAssistant, type Assistant } from '@/common/types/agent/assistantTypes';
import { resolveAssistantName } from '@renderer/utils/model/assistantDisplay';

type SelectedAionrsProvider = {
  id?: string;
  name?: string;
};

type ResolveCronAgentConfigInput = {
  agentValue: string;
  presetAssistants: Assistant[];
  selectedAionrsProvider?: SelectedAionrsProvider;
  model_id?: string;
  config_options?: Record<string, string>;
  workspace?: string;
  skillIds: string[];
  disabledBuiltinSkillIds: string[];
  mcpIds: string[];
  excludeAutoInjectSkills: string[];
  localeKey?: string;
  getMode: (assistant: Assistant) => string | undefined;
  aionrsModelRequiredMessage: string;
};

type ResolveCronAgentConfigResult = {
  agent_config: ICronAgentConfigWrite | undefined;
};

export function resolveCronAgentConfig(input: ResolveCronAgentConfigInput): ResolveCronAgentConfigResult {
  const {
    agentValue,
    presetAssistants,
    selectedAionrsProvider,
    model_id,
    config_options,
    workspace,
    skillIds,
    disabledBuiltinSkillIds,
    mcpIds,
    excludeAutoInjectSkills,
    localeKey = 'en-US',
    getMode,
    aionrsModelRequiredMessage,
  } = input;

  const colonIdx = agentValue.indexOf(':');
  const prefixedId = colonIdx >= 0 ? agentValue.substring(colonIdx + 1) : agentValue;
  const assistantSelection = presetAssistants.find((item) => item.id === prefixedId || item.id === agentValue);
  if (!assistantSelection) {
    throw new Error('assistant_id is required');
  }

  let agent_config: ICronAgentConfigWrite | undefined;

  const assistant = assistantSelection;
  const assistantName = resolveAssistantName(assistant, localeKey, assistant.name);
  const mode = getMode(assistant);
  const capabilitySnapshot = {
    skill_ids: skillIds,
    disabled_builtin_skill_ids: disabledBuiltinSkillIds,
    mcp_ids: mcpIds,
    exclude_auto_inject_skills: excludeAutoInjectSkills,
  };

  if (isAionrsAssistant(assistant)) {
    if (!selectedAionrsProvider?.id || !model_id) {
      throw new Error(aionrsModelRequiredMessage);
    }
    agent_config = {
      name: assistantName,
      assistant_id: assistant.id,
      mode,
      model_id,
      model: {
        provider_id: selectedAionrsProvider.id,
        model: model_id,
        use_model: model_id,
      },
      workspace,
      ...capabilitySnapshot,
    };
  } else {
    agent_config = {
      name: assistantName,
      assistant_id: assistant.id,
      mode,
      model_id,
      config_options,
      workspace,
      ...capabilitySnapshot,
    };
  }

  return { agent_config };
}
