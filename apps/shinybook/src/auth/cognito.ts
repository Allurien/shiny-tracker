// Cognito Hosted-UI OAuth config + low-level token exchange/refresh/logout
// helpers. The React layer (provider.tsx) orchestrates these — this file has
// no side effects and no React.

import * as AuthSession from "expo-auth-session";
import { config } from "../api/config";

// Cognito endpoints, derived from the Hosted UI domain.
export const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: `https://${config.cognitoDomain}/oauth2/authorize`,
  tokenEndpoint: `https://${config.cognitoDomain}/oauth2/token`,
  revocationEndpoint: `https://${config.cognitoDomain}/oauth2/revoke`,
  endSessionEndpoint: `https://${config.cognitoDomain}/logout`,
};

export const COGNITO_SCOPES = ["openid", "email", "profile"];

// Skip Cognito's provider-picker — send users directly to Google.
export const EXTRA_AUTH_PARAMS: Record<string, string> = {
  identity_provider: "Google",
};

export interface TokenSet {
  idToken: string;
  accessToken: string;
  refreshToken: string | null; // refresh doesn't re-issue a refresh token
  expiresAt: number; // epoch ms when idToken/accessToken expire
}

export async function exchangeCode(args: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenSet> {
  const res = await AuthSession.exchangeCodeAsync(
    {
      clientId: config.userPoolClientId,
      code: args.code,
      redirectUri: args.redirectUri,
      extraParams: { code_verifier: args.codeVerifier },
    },
    discovery,
  );
  return toTokenSet(res, null);
}

export async function refreshTokens(
  refreshToken: string,
): Promise<TokenSet> {
  const res = await AuthSession.refreshAsync(
    { clientId: config.userPoolClientId, refreshToken },
    discovery,
  );
  // Cognito refresh flow does NOT return a new refresh_token — keep the old.
  return toTokenSet(res, refreshToken);
}

// Build the hosted-UI logout URL. Visiting it clears the Cognito session
// cookie so the next sign-in actually prompts again. Not strictly required
// for local clear — only matters when the user wants to switch accounts.
export function buildLogoutUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: config.userPoolClientId,
    logout_uri: redirectUri,
  });
  return `${discovery.endSessionEndpoint}?${params.toString()}`;
}

function toTokenSet(
  res: AuthSession.TokenResponse,
  fallbackRefreshToken: string | null,
): TokenSet {
  if (!res.idToken) throw new Error("Cognito did not return an ID token");
  if (!res.accessToken) throw new Error("Cognito did not return an access token");
  const expiresIn = res.expiresIn ?? 3600;
  return {
    idToken: res.idToken,
    accessToken: res.accessToken,
    refreshToken: res.refreshToken ?? fallbackRefreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}
