const PREFIX = 'pixie:';

export const StorageKeys = {
  onboardingDone: 'onboarding-dismissed-v1',
  detail: 'pixel-detail',
} as const;

export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage may be unavailable (private mode, blocked) — preferences just won't persist */
  }
}
