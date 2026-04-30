// Thin wrapper around expo-haptics that no-ops on web (where it throws) and
// silences any runtime failures so a missing permission never breaks a flow.

import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export const tap = () => run(() => Haptics.selectionAsync());
export const light = () =>
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
export const medium = () =>
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
export const success = () =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const warning = () =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

function run(fn: () => Promise<unknown>) {
  if (Platform.OS === "web") return;
  fn().catch(() => {});
}
