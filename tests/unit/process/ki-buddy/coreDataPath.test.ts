import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolveKiBuddyCoreDataPath } from '@/process/ki-buddy/coreDataPath';

describe('resolveKiBuddyCoreDataPath', () => {
  it('keeps the first public Ki-Buddy Core database separate from pre-release data', () => {
    const dataPath = path.join(path.sep, 'application-data', 'aionui');

    expect(resolveKiBuddyCoreDataPath(dataPath)).toBe(path.join(dataPath, 'ki-buddy-core-v1'));
  });

  it('uses the namespace as a relative path when no application data root is available', () => {
    expect(resolveKiBuddyCoreDataPath('')).toBe('ki-buddy-core-v1');
  });
});
