// Environment config for the API layer. Values come from EXPO_PUBLIC_*
// env vars (see sst.config.ts — StaticSite passes them at build/deploy time).

const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL) {
  console.warn(
    "EXPO_PUBLIC_API_URL is not set — API calls will fail. " +
      "Run through SST-deployed site or set env manually for local dev.",
  );
}

export const config = {
  apiUrl: API_URL ?? "",
  userPoolId: process.env.EXPO_PUBLIC_USER_POOL_ID ?? "",
  userPoolClientId: process.env.EXPO_PUBLIC_USER_POOL_CLIENT_ID ?? "",
  cognitoDomain: process.env.EXPO_PUBLIC_COGNITO_DOMAIN ?? "",
};
