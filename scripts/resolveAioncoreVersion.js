/**
 * Resolve the aioncore version tag to download for packaging.
 *
 * release-pinned reads the immutable Ki-Core product tag from package.json.
 * candidate does not resolve a tag. development preserves the legacy
 * AionCore override and fallback behavior for local work only.
 *
 * Keep this file tiny and dependency-free — it's required from both
 * scripts/prepareAioncore.js and scripts/pack-web-cli.js before
 * any project-level install has necessarily completed.
 */

const fs = require('fs');
const path = require('path');
const { getSourcePolicy, readKiCorePin } = require('../packages/shared-scripts/src/kiCoreRelease');

function resolveAioncoreVersion(projectRoot, explicitPolicy) {
  const sourcePolicy = getSourcePolicy(explicitPolicy);
  if (sourcePolicy === 'release-pinned') return readKiCorePin(projectRoot).tag;
  if (sourcePolicy === 'candidate') return null;

  const envOverride = process.env.AIONUI_BACKEND_VERSION;
  if (envOverride && envOverride.trim()) {
    return envOverride.trim();
  }

  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg && typeof pkg.aioncoreVersion === 'string' && pkg.aioncoreVersion.trim()) {
      return pkg.aioncoreVersion.trim();
    }
  } catch {
    // fall through
  }

  return 'latest';
}

module.exports = { resolveAioncoreVersion };
