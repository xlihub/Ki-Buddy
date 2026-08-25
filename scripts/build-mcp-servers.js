#!/usr/bin/env node
/**
 * Build builtin MCP server scripts as fully self-contained CJS bundles.
 *
 * electron-vite's externalizeDepsPlugin leaves all npm packages as require()
 * calls, which works for Electron's main process (ASAR virtual FS patches
 * require()) but fails when an external `node` process runs the script from
 * app.asar.unpacked — there is no ASAR support there.
 *
 * This script uses esbuild's programmatic API (instead of CLI flags) to avoid
 * shell-quoting issues with special characters in --define values.
 */

const esbuild = require('esbuild');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SHARED_OPTIONS = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  tsconfig: path.join(ROOT, 'tsconfig.json'),
  loader: { '.wasm': 'empty' },
};

function resolveOutputDirectory(args) {
  if (args.length === 0) return path.join(ROOT, 'out/main');
  if (args.length === 2 && args[0] === '--out-dir' && args[1]) return path.resolve(args[1]);
  throw new Error('Usage: node scripts/build-mcp-servers.js [--out-dir <path>]');
}

function createBuildOptions(outputDirectory) {
  return [
    {
      ...SHARED_OPTIONS,
      entryPoints: [path.join(ROOT, 'packages/desktop/src/process/resources/builtinMcp/imageGenServer.ts')],
      outfile: path.join(outputDirectory, 'builtin-mcp-image-gen.js'),
    },
    {
      ...SHARED_OPTIONS,
      entryPoints: [path.join(ROOT, 'packages/desktop/src/process/resources/builtinMcp/browserServer.ts')],
      outfile: path.join(outputDirectory, 'builtin-mcp-browser.js'),
    },
    {
      ...SHARED_OPTIONS,
      entryPoints: [path.join(ROOT, 'packages/desktop/src/process/ki-buddy/agents/server.ts')],
      outfile: path.join(outputDirectory, 'builtin-mcp-agents.js'),
    },
  ];
}

async function main() {
  const outputDirectory = resolveOutputDirectory(process.argv.slice(2));
  await Promise.all(createBuildOptions(outputDirectory).map((options) => esbuild.build(options)));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('MCP server build failed:', err);
    process.exit(1);
  });
}

module.exports = { createBuildOptions, resolveOutputDirectory };
