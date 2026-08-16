import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const { verifyKiBuddyUnpacked } = require('../../../packages/shared-scripts/src/kiBuddyUnpacked');
const projectRoot = resolve(__dirname, '../../..');

function createLinuxFixture() {
  const root = mkdtempSync(join(tmpdir(), 'ki-buddy-unpacked-'));
  const resourcesDir = join(root, 'resources');
  mkdirSync(join(resourcesDir, 'ki-buddy'), { recursive: true });
  writeFileSync(join(root, 'Ki-Buddy'), 'executable');
  copyFileSync(join(projectRoot, 'resources/ki-buddy/app.png'), join(resourcesDir, 'app.png'));
  copyFileSync(join(projectRoot, 'resources/ki-buddy/app.png'), join(resourcesDir, 'ki-buddy/app.png'));
  return root;
}

describe('Ki-Buddy unpacked product verification', () => {
  it('accepts an unpacked app with the configured executable and product icons', () => {
    const fixture = createLinuxFixture();
    try {
      expect(verifyKiBuddyUnpacked(projectRoot, fixture, 'linux')).toMatchObject({
        platform: 'linux',
        productName: 'Ki-Buddy',
      });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('rejects an unpacked app containing an upstream icon', () => {
    const fixture = createLinuxFixture();
    try {
      writeFileSync(join(fixture, 'resources/app.png'), 'upstream icon');
      expect(() => verifyKiBuddyUnpacked(projectRoot, fixture, 'linux')).toThrow(
        'does not match the configured Ki-Buddy product resource'
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
