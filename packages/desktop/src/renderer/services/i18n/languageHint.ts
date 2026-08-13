const LANGUAGE_HINT_KEY = 'i18nextLng';

/** Returns the renderer's fast language hint when local storage is available. */
export function getLanguageHint(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(LANGUAGE_HINT_KEY);
}

/** Stores the renderer's fast language hint for the next startup. */
export function setLanguageHint(language: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(LANGUAGE_HINT_KEY, language);
}

/** Removes the client-level language hint when an explicit product reset needs the default again. */
export function clearLanguageHint(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(LANGUAGE_HINT_KEY);
}
