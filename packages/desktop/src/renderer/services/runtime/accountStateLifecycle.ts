type AccountStateResetter = () => void;

const accountStateResetters = new Set<AccountStateResetter>();

/** Registers renderer state that must be cleared whenever the active Core account changes. */
export function registerAccountStateResetter(resetter: AccountStateResetter): () => void {
  accountStateResetters.add(resetter);
  return () => accountStateResetters.delete(resetter);
}

/** Clears all renderer state registered as account-scoped. */
export function resetAccountScopedRendererState(): void {
  accountStateResetters.forEach((resetter) => resetter());
}
