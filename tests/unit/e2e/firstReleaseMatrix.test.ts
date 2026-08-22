import { describe, expect, it } from 'vitest';
import { FIRST_RELEASE_MATRIX } from '../../e2e/features/remote/ki-buddy/firstReleaseMatrix';

describe('Ki-Buddy first-release disabled-feature evidence', () => {
  it('keeps the product policy oracle independent from the current Ki-Core release', () => {
    expect(FIRST_RELEASE_MATRIX).not.toHaveProperty('backend');
  });

  it('classifies every disabled feature exactly once', () => {
    const disabledFeatures = Object.entries(FIRST_RELEASE_MATRIX.features)
      .filter(([, state]) => state === 'disabled')
      .map(([featureId]) => featureId)
      .toSorted();
    const classifiedFeatures = Object.values(FIRST_RELEASE_MATRIX.disabledFeatureEvidence)
      .flatMap((classification) => Object.keys(classification))
      .toSorted();

    expect(classifiedFeatures).toEqual(disabledFeatures);
    expect(new Set(classifiedFeatures).size).toBe(classifiedFeatures.length);
  });

  it('keeps every flash-observed feature connected to at least one selector', () => {
    for (const selectors of Object.values(FIRST_RELEASE_MATRIX.disabledFeatureEvidence.flashObserved)) {
      expect(selectors.length).toBeGreaterThan(0);
      expect(selectors.every((selector) => selector.startsWith('['))).toBe(true);
    }
  });
});
