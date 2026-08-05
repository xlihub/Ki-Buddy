import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function workflow(name: string) {
  return readFileSync(resolve(process.cwd(), '.github/workflows', name), 'utf8');
}

describe('Ki-Core workflow source policies', () => {
  it('requires candidate run ID and full head SHA only in the manual build workflow', () => {
    const manual = workflow('build-manual.yml');
    expect(manual).toContain('ki_core_candidate_run_id:');
    expect(manual).toContain('ki_core_candidate_head_sha:');
    expect(manual).toContain('ki_core_source_policy: candidate');
    expect(manual).toContain('contents: read');
    expect(manual).not.toContain('pull_request:');
  });

  it('keeps official desktop and Web CLI packaging on release-pinned policy', () => {
    const stable = workflow('build-and-release.yml');
    const webCli = workflow('pack-web-cli.yml');
    expect(stable).toContain('ki_core_source_policy: release-pinned');
    expect(stable).not.toContain('ki_core_candidate_run_id:');
    expect(webCli).toContain('AIONUI_BACKEND_SOURCE_POLICY: release-pinned');
    expect(webCli).not.toContain('KI_CORE_ACTIONS_TOKEN');
  });

  it('exposes the candidate token to build commands only when candidate policy is selected', () => {
    const reusable = workflow('_build-reusable.yml');
    const conditionalToken =
      "KI_CORE_ACTIONS_TOKEN: ${{ inputs.ki_core_source_policy == 'candidate' && secrets.KI_CORE_ACTIONS_TOKEN || '' }}";
    expect(reusable).toContain("default: 'release-pinned'");
    expect(reusable).not.toContain('aioncore_run_id:');
    expect(reusable.match(new RegExp(conditionalToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(4);
  });
});
