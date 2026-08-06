import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function workflow(name: string) {
  return readFileSync(resolve(process.cwd(), '.github/workflows', name), 'utf8');
}

describe('Ki-Core workflow source policies', () => {
  it('lets the manual build select a stable release or a verified candidate', () => {
    const manual = workflow('build-manual.yml');
    expect(manual).toContain('ki_core_source_policy:');
    expect(manual).toContain('- release-pinned');
    expect(manual).toContain('- candidate');
    expect(manual).toContain('default: release-pinned');
    expect(manual).toContain('ki_core_candidate_run_id:');
    expect(manual).toContain('ki_core_candidate_head_sha:');
    expect(manual).toContain('KI_CORE_SOURCE_POLICY: ${{ inputs.ki_core_source_policy }}');
    expect(manual).toContain('KI_CORE_CANDIDATE_RUN_ID: ${{ inputs.ki_core_candidate_run_id }}');
    expect(manual).toContain('KI_CORE_CANDIDATE_HEAD_SHA: ${{ inputs.ki_core_candidate_head_sha }}');
    expect(manual).toContain('^[0-9]+$');
    expect(manual).toContain('^[0-9a-f]{40}$');
    expect(manual).toContain('ki_core_source_policy: ${{ inputs.ki_core_source_policy }}');
    expect(manual).not.toContain('upload_source_maps: true');
    expect(manual).toContain('contents: read');
    expect(manual).not.toContain('pull_request:');
  });

  it('keeps official desktop and Web CLI packaging on release-pinned policy', () => {
    const stable = workflow('build-and-release.yml');
    const webCli = workflow('pack-web-cli.yml');
    expect(stable).toContain('ki_core_source_policy: release-pinned');
    expect(stable).toContain("enable_sentry: ${{ vars.KI_ENABLE_SENTRY == 'true' }}");
    expect(stable).toContain("upload_source_maps: ${{ vars.KI_ENABLE_SENTRY == 'true' }}");
    expect(stable).not.toContain('upload_source_maps: true');
    expect(stable).not.toContain('ki_core_candidate_run_id:');
    expect(webCli).toContain('AIONUI_BACKEND_SOURCE_POLICY: release-pinned');
    expect(webCli).not.toContain('KI_CORE_ACTIONS_TOKEN');
  });

  it('creates only an approved Ki-Buddy Draft Release from a product tag', () => {
    const stable = workflow('build-and-release.yml');
    expect(stable).toContain("- 'ki-buddy-v*'");
    expect(stable).toContain('environment: ki-buddy-stable');
    expect(stable).toContain('draft: true');
    expect(stable).toContain('overwrite_files: false');
    expect(stable).toContain('git merge-base --is-ancestor "$GITHUB_SHA" origin/product/main');
    expect(stable).not.toContain('branches: [dev]');
    expect(stable).not.toContain('git tag $TAG_NAME');
  });

  it('does not expose a cross-repository token to branch-controlled build commands', () => {
    const reusable = workflow('_build-reusable.yml');
    expect(reusable).toContain("default: 'release-pinned'");
    expect(reusable).toContain('enable_sentry:');
    expect(reusable).toContain("SENTRY_DSN: ${{ inputs.enable_sentry && secrets.SENTRY_DSN || '' }}");
    expect(reusable).toContain("if: inputs.upload_source_maps && matrix.platform == 'linux-x64'");
    expect(reusable).toContain("npm_config_registry: 'https://registry.npmjs.org/'");
    expect(reusable).not.toContain('aioncore_run_id:');
    expect(reusable).not.toContain('KI_CORE_ACTIONS_TOKEN');
  });

  it('uses the npm registry for managed CLI platform packages in Web CLI builds', () => {
    const webCli = workflow('pack-web-cli.yml');
    expect(webCli).toContain("npm_config_registry: 'https://registry.npmjs.org/'");
  });
});
