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

export type WorkspaceRouteId =
  | 'guid'
  | 'conversation'
  | 'assistants'
  | 'assistantsLegacy'
  | 'componentShowcase'
  | 'scheduledTasks'
  | 'scheduledTaskDetail'
  | 'team';

export type WorkspaceRouteRegistryEntry = Readonly<{
  featureId: ProductFeatureId;
  id: WorkspaceRouteId;
  path: string;
}>;

type WorkspaceFeatureRegistryEntry = Readonly<{
  featureId: ProductFeatureId;
  navigation: readonly Omit<WorkspaceNavigationRegistryEntry, 'featureId'>[];
  routes: readonly Omit<WorkspaceRouteRegistryEntry, 'featureId'>[];
}>;

/** Stable route and navigation identities for every product-controlled workspace feature. */
export const WORKSPACE_FEATURE_REGISTRY = [
  {
    featureId: 'guid',
    navigation: [{ id: 'newConversation', placement: 'primary' }],
    routes: [{ id: 'guid', path: '/guid' }],
  },
  {
    featureId: 'conversation',
    navigation: [
      { id: 'conversationSearch', placement: 'primary' },
      { id: 'conversationHistory', placement: 'history' },
    ],
    routes: [{ id: 'conversation', path: '/conversation/:id' }],
  },
  {
    featureId: 'assistants',
    navigation: [{ id: 'assistants', placement: 'primary' }],
    routes: [
      { id: 'assistants', path: '/assistants' },
      { id: 'assistantsLegacy', path: '/settings/assistants' },
    ],
  },
  {
    featureId: 'scheduledTasks',
    navigation: [{ id: 'scheduledTasks', placement: 'primary' }],
    routes: [
      { id: 'scheduledTasks', path: '/scheduled' },
      { id: 'scheduledTaskDetail', path: '/scheduled/:job_id' },
    ],
  },
  {
    featureId: 'team',
    navigation: [{ id: 'team', placement: 'history' }],
    routes: [{ id: 'team', path: '/team/:id' }],
  },
  {
    featureId: 'componentShowcase',
    navigation: [],
    routes: [{ id: 'componentShowcase', path: '/test/components' }],
  },
] as const satisfies readonly WorkspaceFeatureRegistryEntry[];

export const WORKSPACE_NAVIGATION_REGISTRY: readonly WorkspaceNavigationRegistryEntry[] =
  WORKSPACE_FEATURE_REGISTRY.flatMap(({ featureId, navigation }) =>
    navigation.map((entry) => ({ ...entry, featureId }))
  );

export const WORKSPACE_ROUTE_REGISTRY: readonly WorkspaceRouteRegistryEntry[] = WORKSPACE_FEATURE_REGISTRY.flatMap(
  ({ featureId, routes }) => routes.map((entry) => ({ ...entry, featureId }))
);

export type WorkspaceExperienceProjection = Readonly<{
  navigation: readonly WorkspaceNavigationRegistryEntry[];
  routes: readonly WorkspaceRouteRegistryEntry[];
}>;

/** Projects workspace routes and navigation through one ProductExperience decision per feature. */
export function getWorkspaceExperienceProjection(): WorkspaceExperienceProjection {
  const enabledFeatures = new Set<ProductFeatureId>(
    WORKSPACE_FEATURE_REGISTRY.filter(({ featureId }) => isProductFeatureEnabled(featureId)).map(
      ({ featureId }) => featureId
    )
  );
  return {
    navigation: WORKSPACE_NAVIGATION_REGISTRY.filter(({ featureId }) => enabledFeatures.has(featureId)),
    routes: WORKSPACE_ROUTE_REGISTRY.filter(({ featureId }) => enabledFeatures.has(featureId)),
  };
}

/** Projects the registry through the active ProductExperience without duplicating navigation arrays. */
export function getWorkspaceNavigationProjection(): ReadonlyArray<(typeof WORKSPACE_NAVIGATION_REGISTRY)[number]> {
  return getWorkspaceExperienceProjection().navigation;
}
