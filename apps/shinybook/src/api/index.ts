// Barrel exports so call sites can `import { createPainting } from "../api"`
// once the UI migrates off the local DB layer (phase 4+).

export * as paintingsApi from "./paintings";
export * as drillsApi from "./drills";
export * as sessionsApi from "./sessions";
export * as photosApi from "./photos";
export * as syncApi from "./sync";
export * as restockSubscriptionApi from "./restockSubscription";
export * as wishlistSourcesApi from "./wishlistSources";
export { ApiError } from "./client";
export { setToken, getToken, onTokenChange } from "./token";
export { config as apiConfig } from "./config";
