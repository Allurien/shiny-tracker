// In-memory auth token holder. Phase 3 will plug the Cognito session in here
// (set after sign-in, cleared on sign-out) and persist across restarts.
// Keeping this as its own tiny module so the client.ts fetch wrapper doesn't
// need to know how tokens are acquired.

type TokenListener = (token: string | null) => void;

let currentToken: string | null = null;
const listeners = new Set<TokenListener>();

export function getToken(): string | null {
  return currentToken;
}

export function setToken(token: string | null): void {
  currentToken = token;
  for (const fn of listeners) fn(token);
}

export function onTokenChange(fn: TokenListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
