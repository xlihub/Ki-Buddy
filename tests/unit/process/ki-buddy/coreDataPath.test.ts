import { describe, expect, it } from 'vitest';
import { resolveKiBuddyCoreDataPath } from '@/process/ki-buddy/coreDataPath';

describe('resolveKiBuddyCoreDataPath', () => {
  it('keeps the first public Ki-Buddy Core database separate from pre-release data', () => {
    expect(resolveKiBuddyCoreDataPath('/application-data/aionui')).toBe('/application-data/aionui/ki-buddy-core-v1');
  });
});
