// Cookie / tracking consent manager.
//
// Sunflora currently sets no analytics or marketing cookies — the cart is
// plain localStorage and Supabase auth uses its own session storage, both of
// which count as "strictly necessary" and need no consent gate. This module
// exists so that when analytics or ad pixels (Google Analytics, Meta Pixel,
// etc.) are added, they can be wired to actually respect the visitor's choice
// instead of firing unconditionally:
//
//   import { hasConsent, onConsentChange } from "../lib/consent";
//
//   if (hasConsent("analytics")) loadGoogleAnalytics();
//   onConsentChange((consent) => {
//     if (consent.analytics) loadGoogleAnalytics();
//   });
//
// Bump CONSENT_VERSION whenever the categories on offer change (e.g. a new
// "marketing" pixel is added) — visitors who already answered an older
// version are re-prompted rather than silently treated as opted in.

export type ConsentCategory = "necessary" | "analytics" | "marketing";

export interface ConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  version: number;
  decidedAt: string;
}

const STORAGE_KEY = "sunflora_consent";
export const CONSENT_VERSION = 1;

const CHANGE_EVENT = "sunflora:consent-change";

function safeRead(): ConsentState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Null means the visitor has not made a (current-version) choice yet. */
export function getConsent(): ConsentState | null {
  return safeRead();
}

export function hasConsent(category: ConsentCategory): boolean {
  if (category === "necessary") return true;
  return safeRead()?.[category] === true;
}

export function setConsent(choice: {
  analytics: boolean;
  marketing: boolean;
}): ConsentState {
  const state: ConsentState = {
    necessary: true,
    analytics: choice.analytics,
    marketing: choice.marketing,
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing / storage disabled — the banner will simply reappear
    // next visit, which is an acceptable degradation.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: state }));
  return state;
}

export function acceptAll(): ConsentState {
  return setConsent({ analytics: true, marketing: true });
}

export function rejectNonEssential(): ConsentState {
  return setConsent({ analytics: false, marketing: false });
}

export function onConsentChange(cb: (state: ConsentState) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<ConsentState>).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}
