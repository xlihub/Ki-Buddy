import { describe, expect, it } from 'vitest';
import {
  normalizeAgentsCatalog,
  normalizeAgentsCatalogSelection,
  normalizeAgentsInvokeResponse,
  validateAgentsScalarInputs,
} from '@/process/ki-buddy/agents/contracts';
import catalogFixture from '../../../../fixtures/ki-buddy/agents/catalog.json';
import failedInvokeFixture from '../../../../fixtures/ki-buddy/agents/invoke-failed.json';
import invokeFixture from '../../../../fixtures/ki-buddy/agents/invoke.json';

function captureInvokeFailure(value: unknown): unknown {
  try {
    normalizeAgentsInvokeResponse(value, 'agent-1');
  } catch (error) {
    return error;
  }
  throw new Error('Expected Agents invoke response normalization to fail');
}

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
          allowed_file_types: ['text/plain'],
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

  it('rejects a catalog whose declared total does not match the complete inventory', () => {
    expect(() =>
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
    ).toThrow('Agents catalog total does not match the inventory');
  });

  it('rejects malformed or duplicate entries instead of silently omitting them', () => {
    expect(() =>
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
          {
            agentId: 'agent-feedback',
            agentTitle: 'Duplicate',
            agentDescription: '',
            agentType: 'workflow',
          },
        ],
      })
    ).toThrow('Agents catalog contains a duplicate agentId');

    expect(() =>
      normalizeAgentsCatalog({
        status: 'ok',
        total: 1,
        agents: [{ agentId: 'agent-feedback', agentTitle: '', agentType: 'workflow' }],
      })
    ).toThrow('Agents catalog agentTitle must be a non-empty string');
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

    expect(validateAgentsScalarInputs(description, { query: 'Summary', limit: 3, includeArchived: false })).toEqual({
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

      expect(() => validateAgentsScalarInputs(description, { [fieldName]: 'secret' })).toThrow('forbidden field');
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

      expect(validateAgentsScalarInputs(description, { [fieldName]: 12 })).toEqual({ [fieldName]: 12 });
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

    expect(() => validateAgentsScalarInputs(description, { query: ['not', 'scalar'] })).toThrow('scalar schema');
  });
});

describe('safe invoke result projection', () => {
  it('returns only standardized invoke correlations and text from a compatible fixture response', () => {
    expect(normalizeAgentsInvokeResponse(invokeFixture, 'agent-1')).toEqual({
      agentId: 'agent-1',
      taskId: 'task-redacted-1',
      requestId: 'request-redacted-1',
      text: 'Done.',
    });
  });

  it('rejects a successful invoke response without stable request correlation', () => {
    expect(() =>
      normalizeAgentsInvokeResponse(
        {
          status: 'completed',
          flow_instance_id: 'task-1',
          result: { text: 'Done.' },
        },
        'agent-1'
      )
    ).toThrow('Agents invoke request_id must be a string');
  });

  it('preserves only stable correlations when the Gateway reports a failed invoke', () => {
    expect(captureInvokeFailure(failedInvokeFixture)).toMatchObject({
      code: 'invoke_failed',
      correlation: {
        agentId: 'agent-1',
        requestId: 'request-redacted-failed-1',
      },
    });
  });

  it.each([
    ['task correlation', { status: 'failed', flow_instance_id: 'task-1' }, { agentId: 'agent-1', taskId: 'task-1' }],
    ['agent correlation', { status: 'failed' }, { agentId: 'agent-1' }],
  ])('preserves the available %s for an early Gateway failure', (_name, response, correlation) => {
    expect(captureInvokeFailure(response)).toMatchObject({ code: 'invoke_failed', correlation });
  });

  it.each([
    [
      'non-string request_id',
      { status: 'failed', flow_instance_id: 'task-1', request_id: 42 },
      { agentId: 'agent-1', taskId: 'task-1' },
    ],
    [
      'empty flow_instance_id',
      { status: 'failed', flow_instance_id: ' ', request_id: 'request-1' },
      { agentId: 'agent-1', requestId: 'request-1' },
    ],
    [
      'oversized request_id',
      { status: 'failed', flow_instance_id: 'task-1', request_id: 'r'.repeat(201) },
      { agentId: 'agent-1', taskId: 'task-1' },
    ],
  ])('rejects a failed Gateway response with %s while preserving valid correlation', (_name, response, correlation) => {
    expect(captureInvokeFailure(response)).toMatchObject({ code: 'contract', correlation });
  });
});
