export const KI_BUDDY_OPENING_GUIDE_SEEN_KEY = 'ki-buddy.onboarding.openingGuideSeen_v1';
export const KI_BUDDY_OPENING_GUIDE_REPLAY_EVENT = 'ki-buddy:onboarding-replay';

export function hasSeenKiBuddyOpeningGuide(): boolean {
  return localStorage.getItem(KI_BUDDY_OPENING_GUIDE_SEEN_KEY) === 'true';
}

export function markKiBuddyOpeningGuideSeen(): void {
  localStorage.setItem(KI_BUDDY_OPENING_GUIDE_SEEN_KEY, 'true');
}

export function replayKiBuddyOpeningGuide(): void {
  localStorage.removeItem(KI_BUDDY_OPENING_GUIDE_SEEN_KEY);
  window.dispatchEvent(new CustomEvent(KI_BUDDY_OPENING_GUIDE_REPLAY_EVENT));
}
