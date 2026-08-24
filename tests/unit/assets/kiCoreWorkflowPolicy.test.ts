import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';

type WorkflowStep = Readonly<{
  name?: string;
  run?: string;
  with?: Readonly<Record<string, unknown>>;
}>;

type WorkflowJob = Readonly<{
  steps?: readonly WorkflowStep[];
}>;

type WorkflowDefinition = Readonly<{
  jobs?: Readonly<Record<string, WorkflowJob>>;
}>;

const DEPENDENCY_BOUND_SCRIPT_PATHS = [
  'packages/shared-scripts/src/kiBuddyProductExperienceConsistency.ts',
  'packages/shared-scripts/src/kiBuddyRelease.js',
  'packages/shared-scripts/src/kiBuddyUnpacked.js',
  'packages/shared-scripts/src/prepare-aioncore.js',
  'scripts/build-with-builder.js',
  'scripts/pack-web-cli.js',
  'scripts/prepareAioncore.js',
];

function workflow(name: string) {
  return readFileSync(resolve(process.cwd(), '.github/workflows', name), 'utf8');
}

function workflowNames(): readonly string[] {
  return readdirSync(resolve(process.cwd(), '.github/workflows'))
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .toSorted();
}

function invokesDependencyBoundScript(command: string): boolean {
  return command.split('\n').some((line) => {
    const trimmed = line.trim();
    return DEPENDENCY_BOUND_SCRIPT_PATHS.some(
      (scriptPath) =>
        trimmed.startsWith(`node ${scriptPath}`) ||
        trimmed.startsWith(`bun ${scriptPath}`) ||
        trimmed.includes(`$(node ${scriptPath}`) ||
        trimmed.includes(`$(bun ${scriptPath}`)
    );
  });
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

  it('fetches the mapped AionUi tag in PR and stable release validation', () => {
    for (const name of ['pr-checks.yml', 'build-and-release.yml']) {
      const checks = workflow(name);
      expect(checks).toContain('verify --skip-git true');
      expect(checks).toContain("AIONUI_REPOSITORY=$(jq -r '.aionUi.repository'");
      expect(checks).toContain('https://github.com/${AIONUI_REPOSITORY}.git');
      expect(checks).toContain('refs/tags/${AIONUI_TAG}:refs/tags/${AIONUI_TAG}');
      expect(checks).not.toContain('refs/tags/v2.1.49');
    }
  });

  it('installs stable release validator dependencies before reading the mapped identity', () => {
    const stable = workflow('build-and-release.yml');
    const validateJob = stable.slice(stable.indexOf('  validate-release:'), stable.indexOf('\n  code-quality:'));
    const setupBun = validateJob.indexOf('- name: Setup bun');
    const installDependencies = validateJob.indexOf('- name: Install dependencies');
    const fetchMappedTag = validateJob.indexOf('- name: Fetch mapped AionUi tag');

    expect(setupBun).toBeGreaterThan(-1);
    expect(installDependencies).toBeGreaterThan(setupBun);
    expect(fetchMappedTag).toBeGreaterThan(installDependencies);
    expect(validateJob.slice(installDependencies, fetchMappedTag)).toContain('bun install --frozen-lockfile');
  });

  it('installs workspace dependencies before every dependency-bound repository script invocation', () => {
    const invocations: string[] = [];

    for (const name of workflowNames()) {
      const definition = loadYaml(workflow(name)) as WorkflowDefinition;
      for (const [jobName, job] of Object.entries(definition.jobs ?? {})) {
        const steps = job.steps ?? [];
        for (const [stepIndex, step] of steps.entries()) {
          const command = step.run;
          if (!command || !invokesDependencyBoundScript(command)) continue;

          const invocation = `${name}:${jobName}:${step.name ?? stepIndex + 1}`;
          invocations.push(invocation);
          const priorCommands = steps
            .slice(0, stepIndex)
            .flatMap((priorStep) => {
              const retryCommand = priorStep.with?.command;
              return [priorStep.run, typeof retryCommand === 'string' ? retryCommand : undefined].filter(
                (value): value is string => Boolean(value)
              );
            })
            .join('\n');
          expect(priorCommands, invocation).toContain('bun install --frozen-lockfile');
        }
      }
    }

    expect(invocations.length).toBeGreaterThan(0);
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
