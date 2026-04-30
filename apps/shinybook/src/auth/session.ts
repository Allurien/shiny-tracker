// Persisted-session helpers. Serializes/deserializes TokenSet to storage and
// knows the expiry math for proactive refresh.

import { refreshTokens, type TokenSet } from "./cognito";
import { getItem, removeItem, setItem } from "./storage";

const STORAGE_KEY = "shinybook.session.v1";

// Refresh a few minutes before expiry so an in-flight API call never races
// a token rollover.
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export async function loadSession(): Promise<TokenSet | null> {
  const raw = await getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    await removeItem(STORAGE_KEY);
    return null;
  }
}

export async function saveSession(session: TokenSet): Promise<void> {
  await setItem(STORAGE_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await removeItem(STORAGE_KEY);
}

export function isExpiringSoon(session: TokenSet): boolean {
  return Date.now() >= session.expiresAt - REFRESH_SKEW_MS;
}

// Returns a still-valid session, refreshing if needed. Null means the user
// has to sign in again (no refresh token, or refresh was rejected).
export async function ensureFreshSession(
  session: TokenSet,
): Promise<TokenSet | null> {
  if (!isExpiringSoon(session)) return session;
  if (!session.refreshToken) return null;
  try {
    const refreshed = await refreshTokens(session.refreshToken);
    await saveSession(refreshed);
    return refreshed;
  } catch (err) {
    console.warn("token refresh failed", err);
    await clearSession();
    return null;
  }
}
