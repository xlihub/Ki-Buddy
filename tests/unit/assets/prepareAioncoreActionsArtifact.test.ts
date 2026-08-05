import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const {
  getActionsArtifactName,
  getActionsArtifactMissingMessage,
  prepareAioncore,
} = require('../../../packages/shared-scripts/src/prepare-aioncore');
const { selectCandidateArtifact, validateCandidateRun } = require('../../../packages/shared-scripts/src/kiCoreRelease');

const VALID_SHA = 'a'.repeat(40);

function validRun(overrides = {}) {
  return {
    conclusion: 'success',
    event: 'workflow_dispatch',
    head_branch: 'product/main',
    head_sha: VALID_SHA,
    path: '.github/workflows/build-manual.yml',
    repository: { full_name: 'xlihub/Ki-Core' },
    status: 'completed',
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.AIONUI_BACKEND_EXPECTED_SHA;
  delete process.env.AIONUI_BACKEND_LOCAL_BINARY;
  delete process.env.AIONUI_BACKEND_RUN_ID;
  delete process.env.AIONUI_BACKEND_SOURCE_POLICY;
  delete process.env.KI_CORE_ACTIONS_TOKEN;
});

describe('Ki-Core candidate artifact mapping', () => {
  it.each([
    ['win32', 'x64', 'ki-core-candidate-windows-x64'],
    ['win32', 'arm64', 'ki-core-candidate-windows-arm64'],
    ['darwin', 'x64', 'ki-core-candidate-macos-x64'],
    ['darwin', 'arm64', 'ki-core-candidate-macos-arm64'],
    ['linux', 'x64', 'ki-core-candidate-linux-x64'],
    ['linux', 'arm64', 'ki-core-candidate-linux-arm64'],
  ])('maps %s-%s to %s', (platform, arch, artifactName) => {
    expect(getActionsArtifactName(platform, arch)).toBe(artifactName);
  });

  it('reports the canonical artifact required by a missing candidate', () => {
    expect(
      getActionsArtifactMissingMessage({
        runId: '27319522909',
        platform: 'win32',
        arch: 'x64',
        expectedArtifactName: 'ki-core-candidate-windows-x64',
        availableArtifactNames: ['ki-core-candidate-macos-arm64'],
      })
    ).toContain('Re-run Ki-Core Candidate Build with platform [ windows-x64 ] or all.');
  });
});

describe('Ki-Core candidate run identity', () => {
  it('accepts the expected repository, workflow, successful conclusion, branch, and head SHA', () => {
    expect(() => validateCandidateRun(validRun(), { headSha: VALID_SHA })).not.toThrow();
  });

  it.each([
    ['repository', { repository: { full_name: 'iOfficeAI/AionCore' } }],
    ['workflow', { path: '.github/workflows/release.yml' }],
    ['conclusion', { conclusion: 'failure' }],
    ['head SHA', { head_sha: 'b'.repeat(40) }],
    ['branch', { head_branch: 'feature/untrusted' }],
  ])('rejects a candidate with the wrong %s', (_label, override) => {
    expect(() => validateCandidateRun(validRun(override), { headSha: VALID_SHA })).toThrow(/Ki-Core candidate/);
  });

  it('rejects missing, expired, or duplicate platform artifacts', () => {
    const expectedName = 'ki-core-candidate-linux-x64';
    expect(() => selectCandidateArtifact([], expectedName)).toThrow(/exactly one/);
    expect(() => selectCandidateArtifact([{ name: expectedName, expired: true }], expectedName)).toThrow(/exactly one/);
    expect(() =>
      selectCandidateArtifact(
        [
          { name: expectedName, expired: false },
          { name: expectedName, expired: false },
        ],
        expectedName
      )
    ).toThrow(/exactly one/);
  });
});

describe('Ki-Core candidate source policy', () => {
  it('fails before network access when the read-only candidate token is missing', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'ki-core-candidate-token-'));
    process.env.AIONUI_BACKEND_SOURCE_POLICY = 'candidate';
    process.env.AIONUI_BACKEND_RUN_ID = '123';
    process.env.AIONUI_BACKEND_EXPECTED_SHA = VALID_SHA;
    try {
      expect(() => prepareAioncore({ projectRoot, platform: 'linux', arch: 'x64', version: null })).toThrow(
        /KI_CORE_ACTIONS_TOKEN/
      );
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('keeps local binary development behavior without stable provenance', () => {
    if (process.platform === 'win32') return;
    const root = mkdtempSync(join(tmpdir(), 'ki-core-local-binary-'));
    const projectRoot = join(root, 'project');
    const localBinary = join(root, 'aioncore');
    mkdirSync(dirname(localBinary), { recursive: true });
    writeFileSync(localBinary, '#!/usr/bin/env bash\nexit 0\n');
    chmodSync(localBinary, 0o755);
    process.env.AIONUI_BACKEND_LOCAL_BINARY = localBinary;

    try {
      expect(() => prepareAioncore({ projectRoot, platform: 'linux', arch: 'x64', version: 'v0.1.58' })).toThrow(
        /managed-resources\/manifest\.json/
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
