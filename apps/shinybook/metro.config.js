// Metro config — extends Expo's default with web support for expo-sqlite.
// expo-sqlite ships a wasm worker on web that Metro must treat as an asset
// so the import in expo-sqlite/web/worker.ts resolves at bundle time.
//
// Note: we use the async expo-sqlite API throughout (see src/db/client.ts),
// so SharedArrayBuffer / cross-origin isolation are NOT required and we do
// not set COOP/COEP headers — that keeps cross-origin images (e.g. Shopify
// product photos from cdn.shopify.com) loading without CORP headers.

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("wasm");

module.exports = config;
