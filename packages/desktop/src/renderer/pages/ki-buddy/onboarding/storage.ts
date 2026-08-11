export const KI_BUDDY_OPENING_GUIDE_SEEN_KEY = 'ki-buddy.onboarding.openingGuideSeen_v1';
export const KI_BUDDY_OPENING_GUIDE_REPLAY_EVENT = 'ki-buddy:onboarding-replay';

/** Returns whether this local app profile has completed the Ki-Buddy opening guide. */
export function hasSeenKiBuddyOpeningGuide(): boolean {
  return localStorage.getItem(KI_BUDDY_OPENING_GUIDE_SEEN_KEY) === 'true';
}

/** Records completion of the Ki-Buddy opening guide for this local app profile. */
export function markKiBuddyOpeningGuideSeen(): void {
  localStorage.setItem(KI_BUDDY_OPENING_GUIDE_SEEN_KEY, 'true');
}

/** Clears the completion marker and asks the Ki-Buddy startup wrapper to reopen the guide. */
export function replayKiBuddyOpeningGuide(): void {
  localStorage.removeItem(KI_BUDDY_OPENING_GUIDE_SEEN_KEY);
  window.dispatchEvent(new CustomEvent(KI_BUDDY_OPENING_GUIDE_REPLAY_EVENT));
}
