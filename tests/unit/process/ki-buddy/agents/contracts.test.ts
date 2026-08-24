import { describe, expect, it } from 'vitest';
import {
  normalizeAgentsCatalog,
  normalizeAgentsCatalogSelection,
  validateAgentsFileField,
  validateAgentsInvokeInputs,
} from '@/process/ki-buddy/agents/contracts';
import catalogFixture from '../../../../fixtures/ki-buddy/agents/catalog.json';

describe('safe Agents catalog projection', () => {
  it('projects the exact supported schema for one fixture candidate without current catalog credential fields', () => {
    const catalogWithCredentialCanaries = {
      ...catalogFixture,
      agents: catalogFixture.agents.map((agent, index) =>
        index === 0
          ? {
              ...agent,
              apiKey: 'must-not-be-exposed',
              userId: 'must-not-be-exposed',
              flowId: 'must-not-be-exposed',
              oauthToken: 'must-not-be-exposed',
            }
          : agent
      ),
    };
    const result = normalizeAgentsCatalogSelection(
      catalogWithCredentialCanaries,
      'fixture-feedback-analysis'
    ).description;

    expect(result).toEqual({
      agentId: 'fixture-feedback-analysis',
      title: '客户反馈分析',
      description: '分析脱敏后的客户反馈文本并生成摘要。',
      agentType: 'workflow',
      inputSchema: [
        {
          name: 'feedbackFile',
          description: '脱敏后的反馈文件',
          type: 'file',
          required: true,
          allowed_file_types: ['txt'],
        },
      ],
      outputSchema: [{ name: 'summary', description: '分析摘要', type: 'text', required: true }],
    });
    expect(JSON.stringify(result)).not.toMatch(/apiKey|userId|flowId|oauthToken|must-not-be-exposed/u);
  });

  it('returns the complete safe inventory and excludes fields outside the public catalog summary', () => {
    const result = normalizeAgentsCatalog(catalogFixture);

    expect(result).toEqual({
      total: 2,
      agents: [
        {
          agentId: 'fixture-feedback-analysis',
          title: '客户反馈分析',
          description: '分析脱敏后的客户反馈文本并生成摘要。',
          agentType: 'workflow',
        },
        {
          agentId: 'fixture-report-generation',
          title: '报告生成',
          description: '根据脱敏输入生成报告。',
          agentType: 'a2a',
        },
      ],
    });
  });

  it('derives the public total from usable entries instead of trusting the remote total', () => {
    expect(
      normalizeAgentsCatalog({
        status: 'ok',
        total: 2,
        agents: [
          {
            agentId: 'agent-feedback',
            agentTitle: 'Feedback analyst',
            agentDescription: 'Summarizes customer feedback.',
            agentType: 'workflow',
          },
        ],
      })
    ).toMatchObject({ total: 1 });
  });

  it('keeps usable entries when unrelated entries are malformed or duplicated', () => {
    expect(
      normalizeAgentsCatalog({
        status: 'ok',
        total: 4,
        agents: [
          {
            agentId: 'agent-feedback',
            agentTitle: 'Feedback analyst',
            agentDescription: 'Summarizes customer feedback.',
            agentType: 'workflow',
          },
          { agentId: 'agent-feedback', agentTitle: 'Duplicate', agentType: 'workflow' },
          { agentId: 'agent-malformed', agentTitle: '', agentType: 'workflow' },
          null,
        ],
      })
    ).toEqual({
      total: 1,
      agents: [
        {
          agentId: 'agent-feedback',
          title: 'Feedback analyst',
          description: 'Summarizes customer feedback.',
          agentType: 'workflow',
        },
      ],
    });
  });

  it('fails when a catalog exceeds the supported complete-inventory capacity', () => {
    expect(() =>
      normalizeAgentsCatalog({
        status: 'ok',
        total: 1001,
        agents: Array.from({ length: 1001 }, (_, index) => ({
          agentId: `agent-${index}`,
          agentTitle: `Agent ${index}`,
          agentDescription: '',
          agentType: 'workflow',
        })),
      })
    ).toThrow('Agents catalog exceeds the supported inventory capacity');
  });
});

describe('scalar invoke input enforcement', () => {
  it('accepts exact scalar fields from the freshly selected schema', () => {
    const description = {
      agentId: 'agent-1',
      title: 'Agent 1',
      description: '',
      agentType: 'workflow',
      inputSchema: [
        { name: 'query', description: '', type: 'text', required: true },
        { name: 'limit', description: '', type: 'integer', required: false },
        { name: 'includeArchived', description: '', type: 'boolean', required: false },
      ],
      outputSchema: [],
    };

    expect(validateAgentsInvokeInputs(description, { query: 'Summary', limit: 3, includeArchived: false })).toEqual({
      query: 'Summary',
      limit: 3,
      includeArchived: false,
    });
  });

  it.each(['apiKey', 'userId', 'flowId', 'oauthToken', 'baseUrlOverride'])(
    'rejects current Agents invoke control field %s',
    (fieldName) => {
      const description = {
        agentId: 'agent-1',
        title: 'Agent 1',
        description: '',
        agentType: 'workflow',
        inputSchema: [{ name: fieldName, description: '', type: 'text', required: true }],
        outputSchema: [],
      };

      expect(() => validateAgentsInvokeInputs(description, { [fieldName]: 'secret' })).toThrow('forbidden field');
    }
  );

  it.each(['auth', 'passwordValue', 'apiKeyInput', 'refreshToken', 'authorizationHeader'])(
    'allows scalar business field %s outside the exact current invoke denylist',
    (fieldName) => {
      const description = {
        agentId: 'agent-1',
        title: 'Agent 1',
        description: '',
        agentType: 'workflow',
        inputSchema: [{ name: fieldName, description: '', type: 'integer', required: true }],
        outputSchema: [],
      };

      expect(validateAgentsInvokeInputs(description, { [fieldName]: 12 })).toEqual({ [fieldName]: 12 });
    }
  );

  it('rejects non-scalar values from an otherwise compatible schema', () => {
    const description = {
      agentId: 'agent-1',
      title: 'Agent 1',
      description: '',
      agentType: 'workflow',
      inputSchema: [{ name: 'query', description: '', type: 'text', required: true }],
      outputSchema: [],
    };

    expect(() => validateAgentsInvokeInputs(description, { query: ['not', 'scalar'] })).toThrow('scalar schema');
  });
});

describe('file invoke input enforcement', () => {
  const description = {
    agentId: 'agent-file',
    title: 'File agent',
    description: '',
    agentType: 'workflow',
    inputSchema: [
      {
        name: 'source',
        description: '',
        type: 'file',
        required: true,
        allowed_file_types: ['txt'],
      },
      { name: 'query', description: '', type: 'text', required: false },
    ],
    outputSchema: [],
  };

  it('accepts the remote file URL returned by the upload tool', () => {
    expect(
      validateAgentsInvokeInputs(description, {
        source: 'https://agents.example.test/files/remote-1',
        query: 'Summarize',
      })
    ).toEqual({ source: 'https://agents.example.test/files/remote-1', query: 'Summarize' });
  });

  it.each([[''], [{ fileUrl: 'https://agents.example.test/files/remote-1' }]])(
    'rejects a non-string or empty file input: %j',
    (source) => {
      expect(() => validateAgentsInvokeInputs(description, { source })).toThrow('uploaded file URL');
    }
  );

  it.each([
    ['report.xlsx', 'xlsx'],
    ['photo.png', '.png'],
  ])('accepts an extension declared by the Agent: %s / %s', (fileName, allowedType) => {
    expect(() =>
      validateAgentsFileField(
        {
          ...description,
          inputSchema: [{ ...description.inputSchema[0], allowed_file_types: [allowedType] }],
        },
        'source',
        fileName
      )
    ).not.toThrow();
  });

  it('does not inspect file format when allowed_file_types is absent', () => {
    expect(() =>
      validateAgentsFileField(
        { ...description, inputSchema: [{ ...description.inputSchema[0], allowed_file_types: undefined }] },
        'source',
        'unknown-format.proprietary'
      )
    ).not.toThrow();
  });
});
