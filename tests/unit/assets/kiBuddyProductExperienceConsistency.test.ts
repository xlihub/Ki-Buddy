import { describe, expect, it } from 'vitest';
import {
  inspectProductExperienceSources,
  verifyProductExperienceConsistency,
} from '../../../packages/shared-scripts/src/kiBuddyProductExperienceConsistency';

describe('ProductExperience consistency check', () => {
  it('accepts the current stable product boundaries', () => {
    expect(() => verifyProductExperienceConsistency(process.cwd())).not.toThrow();
  });

  it('detects brand-driven feature decisions and raw capability reads', () => {
    const violations = inspectProductExperienceSources([
      {
        path: 'packages/desktop/src/renderer/pages/example.tsx',
        content: `
          if (brand.productName === 'Ki-Buddy') enableFeature();
          const policy = window.__kiBuddyProductPresentation?.experience;
        `,
      },
    ]);

    expect(violations.map(({ code }) => code)).toEqual(['brand_feature_decision', 'raw_product_capability_read']);
  });

  it('does not treat product copy as a feature decision', () => {
    const violations = inspectProductExperienceSources([
      {
        path: 'packages/desktop/src/renderer/pages/example.tsx',
        content: `const productDescription = 'Ki-Buddy';`,
      },
    ]);

    expect(violations).toEqual([]);
  });

  it('detects main lifecycle policy reads outside the central registry', () => {
    const violations = inspectProductExperienceSources([
      {
        path: 'packages/desktop/src/process/example.ts',
        content: `if (productExperience.featureState('desktopPet') === 'enabled') startPet();`,
      },
    ]);

    expect(violations).toEqual([
      expect.objectContaining({ code: 'unregistered_main_lifecycle', path: 'packages/desktop/src/process/example.ts' }),
    ]);
  });

  it('detects copied feature registrations outside stable registries', () => {
    const violations = inspectProductExperienceSources(
      [
        {
          path: 'packages/desktop/src/renderer/pages/example.tsx',
          content: `const copy = { featureId: 'guid' };`,
        },
      ],
      { featureIds: ['guid'] }
    );

    expect(violations).toEqual([expect.objectContaining({ code: 'duplicate_product_decision_list' })]);
  });

  it('detects copied feature lists outside stable registries', () => {
    const violations = inspectProductExperienceSources(
      [
        {
          path: 'packages/desktop/src/renderer/pages/example.tsx',
          content: `const PRODUCT_FEATURE_IDS = new Set(['guid', 'team']);`,
        },
      ],
      { featureIds: ['guid', 'team'] }
    );

    expect(violations).toEqual([expect.objectContaining({ code: 'duplicate_product_decision_list' })]);
  });

  it('detects resource access decisions outside catalog projections', () => {
    const violations = inspectProductExperienceSources([
      {
        path: 'packages/desktop/src/renderer/pages/example.tsx',
        content: `const visible = productExperience.resourceAccess('skill', 'custom') !== 'hidden';`,
      },
    ]);

    expect(violations).toEqual([expect.objectContaining({ code: 'direct_resource_policy_read' })]);
  });

  it('allows policy access in its owning adapters and catalogs', () => {
    const violations = inspectProductExperienceSources([
      {
        path: 'packages/desktop/src/renderer/services/runtime/kiBuddyRuntime.ts',
        content: `const policy = window.__kiBuddyProductPresentation?.experience;`,
      },
      {
        path: 'packages/desktop/src/renderer/hooks/mcp/catalog.ts',
        content: `const access = productExperience.resourceAccess('mcp', 'custom');`,
      },
      {
        path: 'packages/desktop/src/process/ki-buddy/index.ts',
        content: `const state = productExperience.featureState('desktopPet');`,
      },
    ]);

    expect(violations).toEqual([]);
  });
});
