import { describe, expect, it } from 'vitest';
import { KI_BUDDY_DEFAULT_AGENTS_BASE_URL, parseKiBuddyProductConfig } from '@/common/platform/ki-buddy';

describe('Ki-Buddy product configuration', () => {
  it('uses the public Agents deployment by default', () => {
    expect(KI_BUDDY_DEFAULT_AGENTS_BASE_URL).toBe('https://ksapi.kingsware.cn');
  });

  it.each([
    '',
    'ftp://agents.example.com',
    'https://user:secret@agents.example.com',
    'https://agents.example.com?token=secret',
    'https://agents.example.com#fragment',
  ])('rejects invalid default deployment URL %s', (agentsBaseUrl) => {
    expect(() =>
      parseKiBuddyProductConfig({
        schemaVersion: 1,
        runtimeIdentity: 'ki-buddy',
        defaults: { agentsBaseUrl, language: 'zh-CN' },
      })
    ).toThrow('Agents base URL');
  });

  it('rejects an unsupported product language instead of silently disabling the default', () => {
    expect(() =>
      parseKiBuddyProductConfig({
        schemaVersion: 1,
        runtimeIdentity: 'ki-buddy',
        defaults: { agentsBaseUrl: 'https://agents.example.com', language: 'unsupported' },
      })
    ).toThrow('default language');
  });
});
