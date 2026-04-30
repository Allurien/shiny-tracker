// Restock subscription state for push notifications. The bot reads this row
// on each scheduled check and fans out an Expo Push when new restocks are
// detected. Subscription is per-user (one row, keyed by Cognito sub).

import { requestJson, requestNoBody } from "./client";

export interface RestockSubscription {
  enabled: boolean;
  expoPushToken: string | null;
  updatedAt: string;
}

export async function getSubscription(): Promise<RestockSubscription | null> {
  try {
    return await requestJson<RestockSubscription>("/restock-subscription");
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

export async function putSubscription(args: {
  enabled: boolean;
  expoPushToken: string | null;
}): Promise<RestockSubscription> {
  return requestJson<RestockSubscription>("/restock-subscription", {
    method: "POST",
    body: args,
  });
}

export async function deleteSubscription(): Promise<void> {
  await requestNoBody("/restock-subscription", { method: "DELETE" });
}
