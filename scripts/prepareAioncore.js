/**
 * CLI wrapper for prepare-aioncore.
 *
 * Reads environment variables and invokes the shared module.
 *
 * Source selection is controlled by AIONUI_BACKEND_SOURCE_POLICY.
 *
 * Environment variables:
 *  - AIONUI_BACKEND_SOURCE_POLICY: release-pinned, candidate, or development
 *  - AIONUI_BACKEND_RUN_ID: Ki-Core candidate workflow run id
 *  - AIONUI_BACKEND_EXPECTED_SHA: expected Ki-Core candidate commit
 *  - KI_CORE_ACTIONS_TOKEN: read-only token for candidate artifacts
 *  - AIONUI_BACKEND_VERSION: development-only AionCore override
 *  - AIONUI_BACKEND_ARCH: target architecture (default: process.arch)
 *  - GH_TOKEN / GITHUB_TOKEN: GitHub API token (for rate limiting)
 */

const path = require('path');
const { prepareAioncore } = require('../packages/shared-scripts/src/prepare-aioncore.js');
const { resolveAioncoreVersion } = require('./resolveAioncoreVersion.js');

const projectRoot = path.resolve(__dirname, '..');
const platform = process.platform;
// Support cross-compilation: AIONUI_BACKEND_ARCH > npm_config_target_arch > process.arch
const arch = process.env.AIONUI_BACKEND_ARCH || process.env.npm_config_target_arch || process.arch;
const version = resolveAioncoreVersion(projectRoot);

try {
  prepareAioncore({ projectRoot, platform, arch, version });
} catch (error) {
  console.error('❌ prepareAioncore failed:', error.message);
  process.exit(1);
}

module.exports = function () {
  try {
    return prepareAioncore({ projectRoot, platform, arch, version });
  } catch (error) {
    console.error('❌ prepareAioncore failed:', error.message);
    throw error;
  }
};
