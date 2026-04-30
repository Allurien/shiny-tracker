import {
  Box,
  Button,
  ButtonText,
  Heading,
  HStack,
  Pressable,
  Switch,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, ScrollView } from "react-native";

import { restockSubscriptionApi } from "@/src/api";
import { useAuth } from "@/src/auth/provider";
import {
  RESTOCK_URL,
  registerForRestockNotifications,
} from "@/src/notifications/restock";
import { palette } from "@/src/theme/colors";

interface IdTokenClaims {
  email?: string;
  name?: string;
  sub?: string;
}

function decodeIdToken(idToken: string): IdTokenClaims | null {
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as IdTokenClaims;
  } catch {
    return null;
  }
}

export default function AccountScreen() {
  const { session, signOut } = useAuth();
  const claims = useMemo(
    () => (session ? decodeIdToken(session.idToken) : null),
    [session],
  );

  const onSignOut = async () => {
    await signOut();
    router.replace("/(auth)/sign-in" as never);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: 24, paddingTop: 32, paddingBottom: 48 }}
    >
      <VStack space="xl">
        <Heading color={palette.text}>Settings</Heading>

        <SettingsSection title="Account">
          <Text color={palette.textMuted}>Signed in as</Text>
          <Text color={palette.text} fontSize="$lg">
            {claims?.email ?? claims?.name ?? "(unknown)"}
          </Text>
          <Button
            onPress={onSignOut}
            mt="$4"
            bg={palette.danger}
            $active-bg={palette.danger}
          >
            <ButtonText color={palette.text}>Sign out</ButtonText>
          </Button>
        </SettingsSection>

        <RestockSection />
      </VStack>
    </ScrollView>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <VStack space="sm">
      <Text
        color={palette.textSubtle}
        size="xs"
        fontWeight="$semibold"
        style={{ textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {title}
      </Text>
      <Box
        bg={palette.surface}
        borderRadius="$lg"
        borderWidth={1}
        borderColor={palette.border}
        p="$4"
      >
        <VStack space="sm">{children}</VStack>
      </Box>
    </VStack>
  );
}

type RestockState =
  | { phase: "loading" }
  | { phase: "ready"; enabled: boolean; hasToken: boolean }
  | { phase: "saving"; enabled: boolean; hasToken: boolean }
  | { phase: "unsupported" }
  | { phase: "error"; message: string };

function RestockSection() {
  const [state, setState] = useState<RestockState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS === "web") {
        if (!cancelled) setState({ phase: "unsupported" });
        return;
      }
      try {
        const sub = await restockSubscriptionApi.getSubscription();
        if (cancelled) return;
        setState({
          phase: "ready",
          enabled: !!sub?.enabled,
          hasToken: !!sub?.expoPushToken,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Failed to load",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onToggle = useCallback(
    async (next: boolean) => {
      // Optimistic UI flip with rollback on failure. The flow differs between
      // enable (need permission + token) and disable (just flip the flag).
      const prev = state;
      const prevEnabled = "enabled" in state ? state.enabled : false;
      const prevHasToken = "hasToken" in state ? state.hasToken : false;
      setState({ phase: "saving", enabled: next, hasToken: prevHasToken });

      try {
        if (next) {
          const reg = await registerForRestockNotifications();
          if (reg.status === "unsupported") {
            setState({ phase: "unsupported" });
            return;
          }
          if (reg.status === "denied") {
            setState({
              phase: "error",
              message:
                "Notification permission was denied. Enable it in Settings → Notifications → ShinyBook.",
            });
            return;
          }
          await restockSubscriptionApi.putSubscription({
            enabled: true,
            expoPushToken: reg.token,
          });
          setState({ phase: "ready", enabled: true, hasToken: !!reg.token });
        } else {
          // Keep the token row around so re-enabling is instant; just flip the flag.
          await restockSubscriptionApi.putSubscription({
            enabled: false,
            expoPushToken: null,
          });
          setState({ phase: "ready", enabled: false, hasToken: false });
        }
      } catch (err) {
        setState(prev);
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Failed to update",
        });
        // After a brief moment, restore the prior known state so the UI isn't stuck.
        setTimeout(() => {
          setState({
            phase: "ready",
            enabled: prevEnabled,
            hasToken: prevHasToken,
          });
        }, 2500);
      }
    },
    [state],
  );

  return (
    <SettingsSection title="Restock notifications">
      {state.phase === "loading" ? (
        <Text color={palette.textMuted} size="sm">
          Loading…
        </Text>
      ) : null}

      {state.phase === "unsupported" ? (
        <Text color={palette.textMuted} size="sm">
          Push notifications are only available in the iOS / Android app.
        </Text>
      ) : null}

      {state.phase === "ready" || state.phase === "saving" ? (
        <>
          <HStack alignItems="center" justifyContent="space-between">
            <VStack flex={1} pr="$3">
              <Text color={palette.text}>Notify me about restocks</Text>
              <Text size="xs" color={palette.textSubtle}>
                You&apos;ll get one push per detected restock batch from
                Diamond Art Club&apos;s Back In Stock collection.
              </Text>
            </VStack>
            <Switch
              value={state.enabled}
              onValueChange={onToggle}
              isDisabled={state.phase === "saving"}
              trackColor={{ false: palette.border, true: palette.teal }}
              thumbColor={palette.text}
            />
          </HStack>

          <Box
            mt="$3"
            pt="$3"
            borderTopWidth={1}
            borderTopColor={palette.border}
          >
            <Text color={palette.text} fontWeight="$semibold" size="sm">
              Wishlist matches
            </Text>
            <Text size="xs" color={palette.textSubtle} mt="$1">
              Any painting in your collection marked{" "}
              <Text size="xs" color={palette.text} fontWeight="$semibold">
                Wishlist
              </Text>{" "}
              is automatically tracked. When one of those titles restocks, you
              get a separate notification.
            </Text>
            <Pressable
              onPress={() => router.push("/(tabs)/wishlist" as never)}
              mt="$2"
            >
              <Text size="xs" color={palette.teal} fontWeight="$semibold">
                Manage wishlist →
              </Text>
            </Pressable>
          </Box>

          <Pressable
            onPress={() => router.push("/restocks" as never)}
            mt="$3"
            pt="$3"
            borderTopWidth={1}
            borderTopColor={palette.border}
          >
            <Text color={palette.teal} size="sm">
              View current restocks →
            </Text>
            <Text size="xs" color={palette.textSubtle} mt="$1" selectable>
              {RESTOCK_URL}
            </Text>
          </Pressable>
        </>
      ) : null}

      {state.phase === "error" ? (
        <Box
          bg={`${palette.danger}15`}
          borderRadius="$md"
          borderWidth={1}
          borderColor={palette.danger}
          p="$3"
        >
          <Text color={palette.danger} size="xs">
            {state.message}
          </Text>
        </Box>
      ) : null}
    </SettingsSection>
  );
}
