export const E2E_FORBIDDEN_SELECTORS_QUERY_KEY = 'aionui-e2e-forbidden-selectors';

type E2ERendererEnvironment = Readonly<{
  AIONUI_E2E_FORBIDDEN_SELECTORS?: string;
  AIONUI_E2E_TEST?: string;
}>;

/** Builds the test-only renderer query after validating the selector contract in the main process. */
export function resolveE2ERendererQuery(environment: E2ERendererEnvironment): Record<string, string> | undefined {
  const serializedSelectors = environment.AIONUI_E2E_FORBIDDEN_SELECTORS;
  if (environment.AIONUI_E2E_TEST !== '1' || !serializedSelectors) return undefined;

  const parsedSelectors: unknown = JSON.parse(serializedSelectors);
  if (!Array.isArray(parsedSelectors) || !parsedSelectors.every((selector) => typeof selector === 'string')) {
    throw new Error('AIONUI_E2E_FORBIDDEN_SELECTORS must be a JSON string array');
  }

  return { [E2E_FORBIDDEN_SELECTORS_QUERY_KEY]: JSON.stringify(parsedSelectors) };
}

/** Adds renderer query values without replacing an existing development-server query string. */
export function appendRendererQuery(rendererUrl: string, query: Readonly<Record<string, string>> | undefined): string {
  if (!query) return rendererUrl;

  const target = new URL(rendererUrl);
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
  return target.toString();
}
