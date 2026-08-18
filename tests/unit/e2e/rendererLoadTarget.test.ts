import { describe, expect, it } from 'vitest';
import {
  E2E_FORBIDDEN_SELECTORS_QUERY_KEY,
  appendRendererQuery,
  resolveE2ERendererQuery,
} from '@/process/startup/rendererLoadTarget';

describe('renderer first-frame observer target', () => {
  it('passes validated selectors only in E2E mode', () => {
    expect(
      resolveE2ERendererQuery({
        AIONUI_E2E_TEST: '1',
        AIONUI_E2E_FORBIDDEN_SELECTORS: '["[data-disabled]"]',
      })
    ).toEqual({ [E2E_FORBIDDEN_SELECTORS_QUERY_KEY]: '["[data-disabled]"]' });
    expect(
      resolveE2ERendererQuery({
        AIONUI_E2E_TEST: '0',
        AIONUI_E2E_FORBIDDEN_SELECTORS: '["[data-disabled]"]',
      })
    ).toBeUndefined();
  });

  it('rejects a malformed selector contract before renderer startup', () => {
    expect(() =>
      resolveE2ERendererQuery({
        AIONUI_E2E_TEST: '1',
        AIONUI_E2E_FORBIDDEN_SELECTORS: '{"selector":"[data-disabled]"}',
      })
    ).toThrow('AIONUI_E2E_FORBIDDEN_SELECTORS must be a JSON string array');
  });

  it('preserves an existing development-server query', () => {
    const target = new URL(
      appendRendererQuery('http://127.0.0.1:5173/?existing=1', {
        [E2E_FORBIDDEN_SELECTORS_QUERY_KEY]: '["[data-disabled]"]',
      })
    );
    expect(target.searchParams.get('existing')).toBe('1');
    expect(target.searchParams.get(E2E_FORBIDDEN_SELECTORS_QUERY_KEY)).toBe('["[data-disabled]"]');
  });
});
