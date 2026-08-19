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
  mkdirSync(join(resourcesDir, 'app.asar.unpacked', 'out', 'main'), { recursive: true });
  const managedResourcesDir = join(resourcesDir, 'bundled-aioncore', 'linux-x64', 'managed-resources');
  mkdirSync(join(managedResourcesDir, 'node', 'node-v24-linux-x64', 'bin'), { recursive: true });
  writeFileSync(join(root, 'Ki-Buddy'), 'executable');
  copyFileSync(join(projectRoot, 'resources/ki-buddy/app.png'), join(resourcesDir, 'app.png'));
  copyFileSync(join(projectRoot, 'resources/ki-buddy/app.png'), join(resourcesDir, 'ki-buddy/app.png'));
  writeFileSync(join(resourcesDir, 'app.asar.unpacked', 'out', 'main', 'builtin-mcp-agents.js'), 'adapter');
  writeFileSync(
    join(managedResourcesDir, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 2,
      runtimeKey: 'linux-x64',
      node: {
        version: '24.0.0',
        root: 'node/node-v24-linux-x64',
        executable: 'bin/node',
      },
      clis: [],
    })
  );
  writeFileSync(join(managedResourcesDir, 'node', 'node-v24-linux-x64', 'bin', 'node'), 'node');
  return root;
}

describe('Ki-Buddy unpacked product verification', () => {
  it('accepts an unpacked app with the configured executable and product icons', () => {
    const fixture = createLinuxFixture();
    try {
      expect(verifyKiBuddyUnpacked(projectRoot, fixture, 'linux')).toMatchObject({
        platform: 'linux',
        productName: 'Ki-Buddy',
        agentsMcpAdapterPath: expect.stringContaining('builtin-mcp-agents.js'),
        managedNodePath: expect.stringContaining(join('node-v24-linux-x64', 'bin', 'node')),
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

  it('rejects an unpacked app missing the Agents MCP Adapter entry', () => {
    const fixture = createLinuxFixture();
    try {
      rmSync(join(fixture, 'resources', 'app.asar.unpacked', 'out', 'main', 'builtin-mcp-agents.js'));
      expect(() => verifyKiBuddyUnpacked(projectRoot, fixture, 'linux')).toThrow('Agents MCP Adapter is missing');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('rejects an unpacked app missing the managed Node executable', () => {
    const fixture = createLinuxFixture();
    try {
      rmSync(
        join(
          fixture,
          'resources',
          'bundled-aioncore',
          'linux-x64',
          'managed-resources',
          'node',
          'node-v24-linux-x64',
          'bin',
          'node'
        )
      );
      expect(() => verifyKiBuddyUnpacked(projectRoot, fixture, 'linux')).toThrow('managed Node executable is missing');
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
