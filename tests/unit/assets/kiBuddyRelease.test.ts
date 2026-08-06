import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const {
  createEffectivePackageJson,
  createElectronBuilderConfig,
  readKiBuddyRelease,
  readProductConfig,
  readProductVersion,
  verifyKiBuddyRelease,
} = require('../../../packages/shared-scripts/src/kiBuddyRelease');

const projectRoot = resolve(__dirname, '../../..');

describe('Ki-Buddy product release identity', () => {
  it('validates the current product mapping without requiring repository history', () => {
    expect(() => verifyKiBuddyRelease(projectRoot, { skipGit: true })).not.toThrow();
  });

  it('combines upstream package data with independent Ki-Buddy product metadata', () => {
    const upstreamPackage = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
    const productConfig = readProductConfig(projectRoot);
    const productVersion = readProductVersion(projectRoot);
    const effectivePackage = createEffectivePackageJson(projectRoot);

    expect(effectivePackage).toMatchObject({
      ...productConfig.packageMetadata,
      version: productVersion,
      main: upstreamPackage.main,
      dependencies: upstreamPackage.dependencies,
    });
    expect(effectivePackage.name).not.toBe(upstreamPackage.name);
    expect(effectivePackage.productName).not.toBe(upstreamPackage.productName);
  });

  it('generates the final electron-builder overlay without modifying package.json', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'ki-buddy-builder-config-'));
    const outputPath = join(tempDir, 'electron-builder.json');
    const originalPackage = readFileSync(join(projectRoot, 'package.json'), 'utf8');
    try {
      const config = createElectronBuilderConfig(projectRoot, outputPath);
      const productConfig = readProductConfig(projectRoot);
      const productVersion = readProductVersion(projectRoot);
      expect(config).toMatchObject({
        ...productConfig.electronBuilder,
        extraMetadata: {
          ...productConfig.packageMetadata,
          version: productVersion,
        },
      });
      expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual(config);
      expect(readFileSync(join(projectRoot, 'package.json'), 'utf8')).toBe(originalPackage);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('records the full AionUi, Ki-Core and AionCore mapping', () => {
    const identity = readKiBuddyRelease(projectRoot);
    expect(identity.kiBuddy.tag).toBe(`ki-buddy-v${identity.kiBuddy.version}`);
    expect(identity.kiCore.tag).toBe(`ki-core-v${identity.kiCore.version}`);
    expect(identity.aionUi.tag).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(identity.aionUi.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(identity.aionCore.tag).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(identity.aionCore.peeledCommit).toMatch(/^[0-9a-f]{40}$/);
  });
});
