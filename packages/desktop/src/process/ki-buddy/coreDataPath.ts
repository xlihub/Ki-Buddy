import path from 'node:path';

const KI_BUDDY_CORE_DATA_NAMESPACE = 'ki-buddy-core-v1';

/**
 * Keep Ki-Buddy's first public Core catalog separate from pre-release AionUi data.
 * The versioned namespace stays stable across normal upgrades and must not be
 * changed unless a future product migration explicitly replaces it.
 */
export function resolveKiBuddyCoreDataPath(dataPath: string): string {
  return path.join(dataPath, KI_BUDDY_CORE_DATA_NAMESPACE);
}
