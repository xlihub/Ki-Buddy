import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

export type ProductExperienceSource = Readonly<{ content: string; path: string }>;

export type ProductExperienceViolation = Readonly<{
  code:
    | 'brand_feature_decision'
    | 'direct_resource_policy_read'
    | 'duplicate_product_decision_list'
    | 'raw_product_capability_read'
    | 'unregistered_main_lifecycle';
  detail: string;
  line: number;
  path: string;
}>;

export type ProductExperienceInspectionOptions = Readonly<{
  featureIds?: readonly string[];
}>;

type ProductExperienceRegistry = Readonly<{
  features: Readonly<Record<string, unknown>>;
  resourceKinds: Readonly<Record<string, unknown>>;
  resourceOrigins: Readonly<Record<string, unknown>>;
}>;

const RAW_CAPABILITY_ALLOWED_FILES = new Set([
  'packages/desktop/src/common/types/platform/electron.ts',
  'packages/desktop/src/renderer/services/runtime/kiBuddyRuntime.ts',
]);
const MAIN_LIFECYCLE_POLICY_FILE = 'packages/desktop/src/process/ki-buddy/index.ts';
const DIRECT_RESOURCE_POLICY_ALLOWED_FILES = new Set([
  'packages/desktop/src/common/platform/ki-buddy/experience/index.ts',
  'packages/desktop/src/renderer/hooks/mcp/catalog.ts',
  'packages/desktop/src/renderer/services/runtime/kiBuddyModelCatalog.ts',
  'packages/desktop/src/renderer/services/runtime/kiBuddySkillCatalog.ts',
]);
const PRODUCT_DECISION_REGISTRY_FILES = new Set([
  'packages/desktop/src/common/platform/ki-buddy/experience/index.ts',
  MAIN_LIFECYCLE_POLICY_FILE,
  'packages/desktop/src/renderer/components/layout/Sider/SiderNav/workspaceRegistry.ts',
  'packages/desktop/src/renderer/pages/settings/components/SettingsSider.tsx',
  'packages/desktop/src/renderer/services/runtime/catalogs/kiBuddyResourceRegistry.ts',
]);

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function sourceKind(filePath: string): ts.ScriptKind {
  return filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function violation(
  code: ProductExperienceViolation['code'],
  file: ProductExperienceSource,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  detail: string
): ProductExperienceViolation {
  return {
    code,
    path: file.path,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    detail,
  };
}

function productDecisionText(node: ts.Node, sourceFile: ts.SourceFile): string | null {
  if (ts.isIfStatement(node)) return node.expression.getText(sourceFile);
  if (ts.isConditionalExpression(node)) return node.condition.getText(sourceFile);
  if (ts.isBinaryExpression(node)) return node.getText(sourceFile);
  return null;
}

function isBrandFeatureDecision(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  const text = productDecisionText(node, sourceFile);
  return Boolean(text && /(?:brand|productName|shortName)/.test(text) && /['"](?:Ki-Buddy|ki-buddy)['"]/.test(text));
}

function propertyNameText(name: ts.PropertyName, sourceFile: ts.SourceFile): string {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : name.getText(sourceFile);
}

function stringValue(node: ts.Expression): string | null {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function collectKnownStringLiterals(node: ts.Node, knownValues: ReadonlySet<string>): ReadonlySet<string> {
  const values = new Set<string>();
  function visit(current: ts.Node): void {
    if (ts.isStringLiteral(current) && knownValues.has(current.text)) values.add(current.text);
    ts.forEachChild(current, visit);
  }
  visit(node);
  return values;
}

function isNamedProductDecisionArray(node: ts.ArrayLiteralExpression): boolean {
  let current: ts.Node = node;
  while (
    current.parent &&
    (ts.isAsExpression(current.parent) ||
      ts.isSatisfiesExpression(current.parent) ||
      ts.isParenthesizedExpression(current.parent) ||
      ts.isCallExpression(current.parent) ||
      ts.isNewExpression(current.parent))
  ) {
    current = current.parent;
  }
  const declaration = current.parent;
  return Boolean(
    declaration &&
    ts.isVariableDeclaration(declaration) &&
    ts.isIdentifier(declaration.name) &&
    /(?:PRODUCT|FEATURE|NAVIGATION|ROUTE|RESOURCE|LIFECYCLE)/.test(declaration.name.text)
  );
}

/** Inspects stable ProductExperience ownership boundaries; behavior belongs to integration and packaged E2E tests. */
export function inspectProductExperienceSources(
  files: readonly ProductExperienceSource[],
  options: ProductExperienceInspectionOptions = {}
): ProductExperienceViolation[] {
  const knownFeatureIds = new Set(options.featureIds ?? []);
  const violations: ProductExperienceViolation[] = [];

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    const sourceFile = ts.createSourceFile(
      file.path,
      file.content,
      ts.ScriptTarget.Latest,
      true,
      sourceKind(file.path)
    );

    function visit(node: ts.Node): void {
      if (isBrandFeatureDecision(node, sourceFile)) {
        violations.push(violation('brand_feature_decision', file, sourceFile, node, node.getText(sourceFile)));
      }
      if (
        !PRODUCT_DECISION_REGISTRY_FILES.has(normalizedPath) &&
        ts.isPropertyAssignment(node) &&
        propertyNameText(node.name, sourceFile) === 'featureId'
      ) {
        const featureId = stringValue(node.initializer);
        if (featureId && knownFeatureIds.has(featureId)) {
          violations.push(
            violation('duplicate_product_decision_list', file, sourceFile, node, node.getText(sourceFile))
          );
        }
      }
      if (
        !PRODUCT_DECISION_REGISTRY_FILES.has(normalizedPath) &&
        ts.isArrayLiteralExpression(node) &&
        isNamedProductDecisionArray(node) &&
        collectKnownStringLiterals(node, knownFeatureIds).size >= 2
      ) {
        violations.push(violation('duplicate_product_decision_list', file, sourceFile, node, node.getText(sourceFile)));
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);

    if (file.content.includes('__kiBuddyProductPresentation') && !RAW_CAPABILITY_ALLOWED_FILES.has(normalizedPath)) {
      violations.push(
        violation('raw_product_capability_read', file, sourceFile, sourceFile, '__kiBuddyProductPresentation')
      );
    }
    if (
      normalizedPath.startsWith('packages/desktop/src/process/') &&
      normalizedPath !== MAIN_LIFECYCLE_POLICY_FILE &&
      file.content.includes('.featureState(')
    ) {
      violations.push(violation('unregistered_main_lifecycle', file, sourceFile, sourceFile, '.featureState('));
    }
    if (file.content.includes('.resourceAccess(') && !DIRECT_RESOURCE_POLICY_ALLOWED_FILES.has(normalizedPath)) {
      violations.push(violation('direct_resource_policy_read', file, sourceFile, sourceFile, '.resourceAccess('));
    }
  }

  return violations.filter(
    (current, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.code === current.code && candidate.path === current.path && candidate.line === current.line
      ) === index
  );
}

function readSourceFiles(directory: string, projectRoot: string): ProductExperienceSource[] {
  const files: ProductExperienceSource[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...readSourceFiles(absolutePath, projectRoot));
    else if (/\.tsx?$/.test(entry.name)) {
      files.push({
        path: normalizePath(path.relative(projectRoot, absolutePath)),
        content: fs.readFileSync(absolutePath, 'utf8'),
      });
    }
  }
  return files;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireSameKeys(actual: Record<string, unknown>, expected: Record<string, unknown>, label: string): void {
  const actualKeys = Object.keys(actual).toSorted();
  const expectedKeys = Object.keys(expected).toSorted();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`${label} must match the stable ProductExperience registry`);
  }
}

/** Runs the lightweight repository check used by lint and CI. */
export function verifyProductExperienceConsistency(projectRoot: string): void {
  const registry = JSON.parse(
    fs.readFileSync(
      path.join(projectRoot, 'packages/desktop/src/common/platform/ki-buddy/experience/registry.json'),
      'utf8'
    )
  ) as ProductExperienceRegistry;
  const productConfig = requireRecord(
    JSON.parse(fs.readFileSync(path.join(projectRoot, 'ki-buddy-product.json'), 'utf8')),
    'Ki-Buddy product config'
  );
  const experience = requireRecord(productConfig.experience, 'Product experience');
  const features = requireRecord(experience.features, 'Product feature policy');
  const resources = requireRecord(experience.resources, 'Product resource policy');
  requireSameKeys(features, registry.features, 'Product feature policy');
  requireSameKeys(resources, registry.resourceKinds, 'Product resource policy');
  for (const access of Object.values(resources)) {
    requireSameKeys(
      requireRecord(access, 'Product resource origin policy'),
      registry.resourceOrigins,
      'Product resource origin policy'
    );
  }

  const files = readSourceFiles(path.join(projectRoot, 'packages/desktop/src'), projectRoot);
  const violations = inspectProductExperienceSources(files, { featureIds: Object.keys(registry.features) });
  if (violations.length > 0) {
    const details = violations
      .map(({ code, path: filePath, line, detail }) => `${filePath}:${line} [${code}] ${detail}`)
      .join('\n');
    throw new Error(`ProductExperience consistency check failed:\n${details}`);
  }
}

if (import.meta.main) {
  try {
    verifyProductExperienceConsistency(path.resolve(import.meta.dir, '../../..'));
    console.log('ProductExperience consistency check passed.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
