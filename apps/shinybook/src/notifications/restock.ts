// Push notification setup for restock alerts. Uses Expo's push service so the
// bot can POST to a single endpoint without juggling APNs/FCM credentials.
//
// Flow:
//   1. App calls registerForRestockNotifications(): requests permission, fetches
//      ExponentPushToken[xxx] from Expo, returns it (caller persists via API).
//   2. Bot's CheckFunction reads tokens from app's DynamoDB, POSTs to
//      https://exp.host/--/api/v2/push/send when restocks are detected.
//   3. setupTapHandler() routes the notification tap: opens DAC's back-in-stock
//      URL in the device browser, falling back to /restocks in the app if
//      Linking can't open the URL.

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const RESTOCK_URL =
  "https://www.diamondartclub.com/collections/diamond-painting-restocks";
export const ANDROID_CHANNEL_ID = "restocks";

// Notifications received while the app is in the foreground are silent by
// default. We want the same banner/sound treatment as background pushes —
// users explicitly opted in, so surfacing immediately is the right call.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Restock alerts",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
  });
}

export interface RegisterResult {
  status: "granted" | "denied" | "unsupported";
  token: string | null;
}

export async function registerForRestockNotifications(): Promise<RegisterResult> {
  // Web + simulators don't get real push tokens. Caller treats this as a
  // no-op and shows an explanatory message in the UI.
  if (Platform.OS === "web" || !Device.isDevice) {
    return { status: "unsupported", token: null };
  }

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.status === "granted";
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.status === "granted";
  }
  if (!granted) return { status: "denied", token: null };

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId
    ?? (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
  const tokenRes = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  return { status: "granted", token: tokenRes.data };
}

// Wires up tap routing. Returns a cleanup fn for use inside useEffect.
// Called once at app boot from the auth provider (or root layout).
export function setupTapHandler(
  fallback: (path: string) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    const data = res.notification.request.content.data as
      | { url?: string }
      | undefined;
    const url = typeof data?.url === "string" ? data.url : RESTOCK_URL;
    Linking.openURL(url).catch(() => {
      // Browser open failed — surface the in-app fallback so the user still
      // sees the restock list with a prominent re-link to DAC at the top.
      fallback("/restocks");
    });
  });
  return () => sub.remove();
}
