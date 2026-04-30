// Auth context + hook. Owns the in-memory session state, bootstraps from
// persistent storage on mount, exposes `signIn` / `signOut`, and keeps the
// API layer's bearer token in sync (src/api/token.ts).

import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { setToken } from "../api/token";
import * as sync from "../sync/manager";
import {
  COGNITO_SCOPES,
  EXTRA_AUTH_PARAMS,
  discovery,
  exchangeCode,
  type TokenSet,
} from "./cognito";
import { config } from "../api/config";
import {
  clearSession as clearStoredSession,
  ensureFreshSession,
  loadSession,
  saveSession,
} from "./session";

// Required on web so the auth tab can hand the result back to the opener.
WebBrowser.maybeCompleteAuthSession();

export interface AuthState {
  status: "loading" | "signedOut" | "signedIn";
  session: TokenSet | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  // Exposed for API callers that want to proactively refresh before a request.
  ensureFresh: () => Promise<TokenSet | null>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [session, setSession] = useState<TokenSet | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const redirectUri = useMemo(
    () =>
      AuthSession.makeRedirectUri({
        scheme: "shinybook",
        path: "auth/callback",
      }),
    [],
  );

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: config.userPoolClientId,
      scopes: COGNITO_SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: EXTRA_AUTH_PARAMS,
    },
    discovery,
  );

  // Schedule the next refresh a bit before the current token expires.
  const scheduleRefresh = useCallback((s: TokenSet) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const skew = 60 * 1000;
    const delay = Math.max(30 * 1000, s.expiresAt - Date.now() - skew);
    refreshTimer.current = setTimeout(async () => {
      const fresh = await ensureFreshSession(s);
      if (fresh) applySession(fresh);
      else clearEverything();
    }, delay);
  }, []);

  const applySession = useCallback(
    (s: TokenSet) => {
      setSession(s);
      setStatus("signedIn");
      setToken(s.idToken);
      scheduleRefresh(s);
      // Idempotent — safe to call on every refresh.
      sync.start();
    },
    [scheduleRefresh],
  );

  const clearEverything = useCallback(async () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = null;
    setSession(null);
    setStatus("signedOut");
    setToken(null);
    sync.stop();
    await clearStoredSession();
  }, []);

  // Bootstrap from persisted session on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadSession();
      if (cancelled) return;
      if (!stored) {
        setStatus("signedOut");
        return;
      }
      const fresh = await ensureFreshSession(stored);
      if (cancelled) return;
      if (fresh) applySession(fresh);
      else {
        setStatus("signedOut");
        setToken(null);
      }
    })();
    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [applySession]);

  // Watch for the OAuth response and exchange the code.
  useEffect(() => {
    if (!response || !request) return;
    if (response.type !== "success") return;
    const { code } = response.params;
    const codeVerifier = request.codeVerifier;
    if (!code || !codeVerifier) return;

    (async () => {
      try {
        const tokens = await exchangeCode({
          code,
          codeVerifier,
          redirectUri,
        });
        await saveSession(tokens);
        applySession(tokens);
      } catch (err) {
        console.error("code exchange failed", err);
        setStatus("signedOut");
      }
    })();
  }, [response, request, redirectUri, applySession]);

  const signIn = useCallback(async () => {
    if (!request) return;
    await promptAsync();
  }, [request, promptAsync]);

  const signOut = useCallback(async () => {
    await clearEverything();
  }, [clearEverything]);

  const ensureFresh = useCallback(async () => {
    if (!session) return null;
    const fresh = await ensureFreshSession(session);
    if (fresh && fresh !== session) applySession(fresh);
    if (!fresh) await clearEverything();
    return fresh;
  }, [session, applySession, clearEverything]);

  const value = useMemo<AuthState>(
    () => ({ status, session, signIn, signOut, ensureFresh }),
    [status, session, signIn, signOut, ensureFresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
