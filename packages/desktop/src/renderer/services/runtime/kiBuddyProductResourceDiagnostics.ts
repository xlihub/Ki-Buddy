import type { ProductResourceHiddenRecord, ProductResourceKind } from '@/common/platform/ki-buddy';

const RESOURCE_KIND_LABELS: Record<ProductResourceKind, string> = {
  agent: 'Agent',
  assistant: 'Assistant',
  mcp: 'MCP',
  model: 'Model',
  skill: 'Skill',
};

/** Emits non-sensitive diagnostics for resources hidden by the active product policy. */
export function reportHiddenProductResources(
  kind: ProductResourceKind,
  hiddenResources: readonly ProductResourceHiddenRecord[]
): void {
  if (hiddenResources.length === 0) return;
  console.info(`[ProductExperience] ${RESOURCE_KIND_LABELS[kind]} resources hidden by product policy`, {
    code: 'product_resource_projection',
    resources: hiddenResources,
  });
}
