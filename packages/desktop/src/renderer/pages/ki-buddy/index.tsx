/** Loads the Ki-Buddy login page without evaluating it in other product runtimes. */
export const loadKiBuddyLoginPage = () => import('./Login');

/** Loads the Ki-Buddy account page without evaluating it in other product runtimes. */
export const loadKiBuddyAccountSettings = () => import('./Account');

/** Loads the Ki-Buddy startup gate without evaluating it in other product runtimes. */
export const loadKiBuddyStartupGate = () => import('./KiBuddyStartupGate');
