import { describe, expect, it } from 'vitest';
import { normalizeAgentsCatalog } from '@/process/ki-buddy/agents/catalog';
import catalogFixture from '../../../../fixtures/ki-buddy/agents/catalog.json';

describe('normalizeAgentsCatalog', () => {
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
