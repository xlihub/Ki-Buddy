import { describe, expect, it } from 'vitest';
import { normalizeAgentsBaseUrl } from '@/common/platform/ki-buddy';

describe('Agents deployment URL normalization', () => {
  it('canonicalizes deployment URLs for configuration, requests, and renderer history', () => {
    expect(normalizeAgentsBaseUrl(' https://AGENTS.example.com/path/ ')).toBe('https://agents.example.com/path');
  });

  it.each([
    'ftp://agents.example.com',
    'https://user:secret@agents.example.com',
    'https://agents.example.com?token=secret',
    'https://agents.example.com#fragment',
    'not-a-url',
  ])('rejects unsafe Agents deployment URL %s', (value) => {
    expect(normalizeAgentsBaseUrl(value)).toBeNull();
  });
});
