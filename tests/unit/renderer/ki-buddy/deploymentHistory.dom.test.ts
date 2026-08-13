import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readDeploymentHistory, recordSuccessfulDeployment } from '@/renderer/pages/ki-buddy/deploymentHistory';

const STORAGE_KEY = 'ki-buddy.login.successfulDeployments_v1';

describe('Ki-Buddy successful deployment history', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps the most recent successful deployment first without duplicates', () => {
    recordSuccessfulDeployment('https://agents-one.example.com/');
    recordSuccessfulDeployment('https://agents-two.example.com');
    recordSuccessfulDeployment('https://agents-one.example.com');

    expect(readDeploymentHistory()).toEqual({
      lastSuccessful: 'https://agents-one.example.com',
      successfulUrls: ['https://agents-one.example.com', 'https://agents-two.example.com'],
    });
  });

  it('ignores malformed storage entries and unsafe deployment values', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        lastSuccessful: 'javascript:alert(1)',
        successfulUrls: [null, 'not a URL', 'https://user:secret@agents.example.com'],
      })
    );

    expect(readDeploymentHistory()).toEqual({ lastSuccessful: null, successfulUrls: [] });
  });

  it('does not interrupt login completion when local storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() => recordSuccessfulDeployment('https://agents.example.com')).not.toThrow();
  });

  it('retains the ten most recent successful deployments', () => {
    for (let index = 0; index < 12; index += 1) {
      recordSuccessfulDeployment(`https://agents-${index}.example.com`);
    }

    const history = readDeploymentHistory();
    expect(history.successfulUrls).toHaveLength(10);
    expect(history.successfulUrls[0]).toBe('https://agents-11.example.com');
    expect(history.successfulUrls).not.toContain('https://agents-0.example.com');
  });

  it('ignores an unexpectedly large stored payload', () => {
    localStorage.setItem(STORAGE_KEY, 'x'.repeat(64 * 1024 + 1));

    expect(readDeploymentHistory()).toEqual({ lastSuccessful: null, successfulUrls: [] });
  });
});
