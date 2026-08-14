import type { SupportedLanguage } from '@/common/config/i18n';
import productLocaleBundle from './localeBundle.json';

type KiBuddyLocaleIdentity = {
  cliName: string;
  language: SupportedLanguage;
  namespace: string;
  productName: string;
};

type LocalePath = readonly [module: string, ...keys: string[]];

const PRODUCT_NAME_PATHS: readonly LocalePath[] = [
  ['common', 'tray.showWindow'],
  ['common', 'tray.about'],
  ['common', 'backendStartup', 'incompatibleRuntime', 'description'],
  ['common', 'backendStartup', 'incompleteInstallation', 'title'],
  ['common', 'backendStartup', 'incompleteInstallation', 'description'],
  ['common', 'backendStartup', 'incompleteInstallation', 'runtimeComponentDescription'],
  ['common', 'backendStartup', 'packageArchitectureMismatch', 'title'],
  ['common', 'backendStartup', 'packageArchitectureMismatch', 'description'],
  ['common', 'backendStartup', 'dataMigration', 'description'],
  ['common', 'backendStartup', 'localDataRepair', 'description'],
  ['common', 'backendStartup', 'startupDirectory', 'description'],
  ['common', 'backendStartup', 'recoverableDatabaseCorruption', 'description'],
  ['common', 'backendStartup', 'transientConcurrentStartup', 'title'],
  ['common', 'backendStartup', 'transientConcurrentStartup', 'description'],
  ['conversation', 'welcome', 'quickActionsTitle'],
  ['conversation', 'welcome', 'quickActionStar'],
  ['conversation', 'welcome', 'skillsMarket'],
  ['conversation', 'agentError', 'codes', 'WORKSPACE_PATH_CONTAINS_WHITESPACE_RUNTIME_UNSUPPORTED', 'body'],
  ['conversation', 'agentError', 'codes', 'WORKSPACE_PATH_CONTAINS_WHITESPACE_RUNTIME_UNSUPPORTED', 'bodyWithPath'],
  ['conversation', 'agentError', 'codes', 'MCP_HTTP_RESPONSE_READ_FAILED', 'body'],
  ['conversation', 'agentError', 'codes', 'MCP_TOOL_RESPONSE_UNEXPECTED', 'body'],
  ['conversation', 'agentError', 'codes', 'MCP_TCP_READ_FAILED', 'body'],
  ['cron', 'status', 'defaultPrompt'],
  ['cron', 'page', 'description'],
  ['cron', 'page', 'keepAwakeTooltip'],
  ['login', 'pageTitle'],
  ['login', 'brand'],
  ['preview', 'office', 'serverInstall', 'hint'],
  ['settings', 'skillsHub', 'officialHint'],
  ['settings', 'officialAssistantsHint'],
  ['settings', 'officialAssistantsHintShort'],
  ['settings', 'myAssistantsEmpty'],
  ['settings', 'startOnBootDesc'],
  ['settings', 'hardwareAccelerationAutoDisabledNotice'],
  ['settings', 'hardwareAccelerationRestartConfirm'],
  ['settings', 'webui.description'],
  ['settings', 'webui.browserNotSupportedDesc'],
  ['settings', 'webui.featureRemoteDesc'],
  ['settings', 'webui.featureChannelsDesc'],
  ['settings', 'channels.telegramDesc'],
  ['settings', 'channels.slackDesc'],
  ['settings', 'channels.discordDesc'],
  ['settings', 'channels.larkDesc'],
  ['settings', 'channels.dingtalkDesc'],
  ['settings', 'channels.weixinDesc'],
  ['settings', 'channels.wecomDesc'],
  ['settings', 'channels.guide'],
  ['settings', 'mcpErrorBunCommandNotFound'],
  ['settings', 'mcpErrorUvCommandNotFound'],
  ['settings', 'mcpErrorPythonCommandNotFound'],
  ['settings', 'mcpErrorDenoCommandNotFound'],
  ['settings', 'mcpErrorCommandPermissionDenied'],
  ['settings', 'mcpErrorCommandStartFailed'],
  ['settings', 'mcpErrorConnectionFailed'],
  ['settings', 'mcpErrorProtocol'],
  ['settings', 'mcpImportDescription'],
  ['settings', 'mcpWillImport'],
  ['settings', 'mcpImported'],
  ['settings', 'talkToButler', 'prompt', 'setupRemote'],
  ['settings', 'talkToButler', 'prompt', 'diagnose'],
  ['settings', 'talkToButler', 'prompt', 'diagnoseChatError'],
  ['settings', 'browserData', 'agentControlDesc'],
  ['update', 'installerLastFailure', 'description'],
];

const ASSISTANT_NAME_NEUTRAL_PATHS: readonly LocalePath[] = [['settings', 'talkToButler', 'enabledToast']];

const CLI_NAME_PATHS: readonly LocalePath[] = [
  ['cron', 'page', 'form', 'aionrsModelRequired'],
  ['login', 'kiBuddy', 'onboarding', 'tools', 'aionCli'],
  ['settings', 'customModelSupportNote'],
  ['settings', 'modelDescription'],
  ['settings', 'agentManagement', 'localAgentsDescription'],
  ['team', 'create', 'supportedAgentsHint'],
];

/** Explicit product locale bundle. Migration-letter attribution intentionally stays upstream-owned. */
export const KI_BUDDY_LOCALE_BUNDLE = {
  namespace: 'kiBuddy',
  productNamePaths: PRODUCT_NAME_PATHS,
  cliNamePaths: CLI_NAME_PATHS,
  assistantNameNeutralPaths: ASSISTANT_NAME_NEUTRAL_PATHS,
  resources: productLocaleBundle,
} as const;

const PRODUCT_LOCALE_RESOURCES = productLocaleBundle as Record<string, Record<string, unknown>>;

function readPath(root: Record<string, unknown>, path: LocalePath): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function writePath(root: Record<string, unknown>, path: LocalePath, value: string): void {
  let current = root;
  for (const [index, key] of path.entries()) {
    if (index === path.length - 1) {
      current[key] = value;
      return;
    }
    const child = current[key];
    if (typeof child !== 'object' || child === null || Array.isArray(child)) return;
    const clonedChild = { ...(child as Record<string, unknown>) };
    current[key] = clonedChild;
    current = clonedChild;
  }
}

function applyPaths(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  paths: readonly LocalePath[],
  replace: (value: string) => string
): void {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === 'string') writePath(target, path, replace(value));
  }
}

/** Applies only product-owned locale keys while leaving the upstream locale and attribution text unchanged. */
export function applyKiBuddyLocaleOverlay(
  locale: Record<string, unknown>,
  identity: KiBuddyLocaleIdentity
): Record<string, unknown> {
  if (identity.namespace !== KI_BUDDY_LOCALE_BUNDLE.namespace) {
    throw new Error(`Unsupported Ki-Buddy locale namespace: ${identity.namespace}`);
  }
  const productLocale = PRODUCT_LOCALE_RESOURCES[identity.language];
  if (!productLocale) throw new Error(`Missing Ki-Buddy locale bundle: ${identity.language}`);
  const result = { ...locale };
  applyPaths(result, locale, PRODUCT_NAME_PATHS, (value) => value.replaceAll(/AionUi|AionUI/g, identity.productName));
  applyPaths(result, locale, CLI_NAME_PATHS, (value) => value.replaceAll(/Aion CLI|AionCLI/g, identity.cliName));
  applyPaths(result, productLocale, ASSISTANT_NAME_NEUTRAL_PATHS, (value) => value);
  return result;
}
