import { describe, expect, it } from 'vitest';
import { normalizeAgentsBaseUrl } from '@/common/platform/ki-buddy';

describe('Agents deployment URL normalization', () => {
  it('canonicalizes deployment URLs for configuration, requests, and renderer history', () => {
    expect(normalizeAgentsBaseUrl(' https://AGENTS.example.com/path/ ')).toBe('https://agents.example.com/path');
  });

  it.each(['http://localhost:8000/path/', 'http://127.0.0.1:8000/path/', 'http://[::1]:8000/path/'])(
    'allows loopback HTTP deployment URL %s for local development',
    (value) => {
      expect(normalizeAgentsBaseUrl(value)).toBe(value.replace(/\/$/u, ''));
    }
  );

  it.each([
    'ftp://agents.example.com',
    'https://user:secret@agents.example.com',
    'https://agents.example.com?token=secret',
    'https://agents.example.com#fragment',
    'http://agents.example.com',
    'http://192.168.1.8:8000',
    'not-a-url',
  ])('rejects unsafe Agents deployment URL %s', (value) => {
    expect(normalizeAgentsBaseUrl(value)).toBeNull();
  });
});
