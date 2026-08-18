import type { ProductFeatureId } from '@/common/platform/ki-buddy';
import { isProductFeatureEnabled } from '@/renderer/services/runtime/kiBuddyRuntime';

export type WorkspaceNavigationId =
  | 'newConversation'
  | 'conversationSearch'
  | 'assistants'
  | 'scheduledTasks'
  | 'conversationHistory'
  | 'team';

export type WorkspaceNavigationRegistryEntry = Readonly<{
  featureId: ProductFeatureId;
  id: WorkspaceNavigationId;
  placement: 'primary' | 'history';
}>;

/** Stable workspace navigation order shared by the complete and product-projected UIs. */
export const WORKSPACE_NAVIGATION_REGISTRY = [
  { id: 'newConversation', featureId: 'guid', placement: 'primary' },
  { id: 'conversationSearch', featureId: 'conversation', placement: 'primary' },
  { id: 'assistants', featureId: 'assistants', placement: 'primary' },
  { id: 'scheduledTasks', featureId: 'scheduledTasks', placement: 'primary' },
  { id: 'conversationHistory', featureId: 'conversation', placement: 'history' },
  { id: 'team', featureId: 'team', placement: 'history' },
] as const satisfies readonly WorkspaceNavigationRegistryEntry[];

/** Projects the registry through the active ProductExperience without duplicating navigation arrays. */
export function getWorkspaceNavigationProjection(): ReadonlyArray<(typeof WORKSPACE_NAVIGATION_REGISTRY)[number]> {
  return WORKSPACE_NAVIGATION_REGISTRY.filter(({ featureId }) => isProductFeatureEnabled(featureId));
}
