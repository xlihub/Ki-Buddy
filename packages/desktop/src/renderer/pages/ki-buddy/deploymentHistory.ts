const DEPLOYMENT_HISTORY_STORAGE_KEY = 'ki-buddy.login.successfulDeployments_v1';
const MAX_HISTORY_STORAGE_LENGTH = 64 * 1024;
const MAX_SUCCESSFUL_DEPLOYMENTS = 10;

export type DeploymentHistory = {
  lastSuccessful: string | null;
  successfulUrls: string[];
};

const EMPTY_HISTORY: DeploymentHistory = {
  lastSuccessful: null,
  successfulUrls: [],
};

/** Reads and validates the successful Ki-Buddy deployment history stored on this device. */
export function readDeploymentHistory(): DeploymentHistory {
  try {
    const serialized = localStorage.getItem(DEPLOYMENT_HISTORY_STORAGE_KEY);
    if (!serialized || serialized.length > MAX_HISTORY_STORAGE_LENGTH) return EMPTY_HISTORY;

    const parsed = JSON.parse(serialized) as unknown;
    if (!parsed || typeof parsed !== 'object') return EMPTY_HISTORY;

    const record = parsed as Record<string, unknown>;
    const lastSuccessful = normalizeAgentsBaseUrl(record.lastSuccessful);
    const rawUrls = Array.isArray(record.successfulUrls) ? record.successfulUrls : [];
    const successfulUrls = Array.from(
      new Set(rawUrls.map(normalizeAgentsBaseUrl).filter((url): url is string => url !== null))
    ).slice(0, MAX_SUCCESSFUL_DEPLOYMENTS);

    if (lastSuccessful) {
      return {
        lastSuccessful,
        successfulUrls: [lastSuccessful, ...successfulUrls.filter((url) => url !== lastSuccessful)].slice(
          0,
          MAX_SUCCESSFUL_DEPLOYMENTS
        ),
      };
    }
    return { lastSuccessful: null, successfulUrls };
  } catch {
    return EMPTY_HISTORY;
  }
}

/** Records a normalized deployment URL after Agents authentication succeeds. */
export function recordSuccessfulDeployment(value: string): DeploymentHistory {
  const normalized = normalizeAgentsBaseUrl(value);
  if (!normalized) return readDeploymentHistory();

  const current = readDeploymentHistory();
  const next: DeploymentHistory = {
    lastSuccessful: normalized,
    successfulUrls: [normalized, ...current.successfulUrls.filter((url) => url !== normalized)].slice(
      0,
      MAX_SUCCESSFUL_DEPLOYMENTS
    ),
  };

  try {
    localStorage.setItem(DEPLOYMENT_HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Login must remain successful when renderer storage is unavailable.
  }
  return next;
}
import { normalizeAgentsBaseUrl } from '@/common/platform/ki-buddy';
