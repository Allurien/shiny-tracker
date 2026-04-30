import { GluestackUIProvider } from "@gluestack-ui/themed";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { AuthProvider, useAuth } from "@/src/auth/provider";
import { initDb } from "@/src/db/schema";
import { setupTapHandler } from "@/src/notifications/restock";
import { palette } from "@/src/theme/colors";
import { config } from "@/src/theme/gluestackConfig";

export default function RootLayout() {
  useEffect(() => {
    initDb().catch((err) => console.error("initDb failed", err));
  }, []);

  return (
    <GluestackUIProvider config={config} colorMode="dark">
      <StatusBar style="light" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </GluestackUIProvider>
  );
}

// Routes the user to / from the (auth) group based on session status.
// Anything that mounts under <Stack> here is protected — the gate below
// short-circuits to a loading or sign-in view until the bootstrap settles.
function RootNavigator() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Restock push tap routing. Mount once at the root so the listener exists
  // even before the user navigates anywhere — taps on a notification while
  // the app is cold-started should still route correctly.
  useEffect(() => {
    return setupTapHandler((path) => router.push(path as never));
  }, [router]);

  useEffect(() => {
    if (status === "loading") return;
    // Cast: typed-routes regenerates after the dev server picks up the new
    // (auth) group; until then the union literal is missing it.
    const inAuthGroup = (segments[0] as string) === "(auth)";
    // /auth/callback is the OAuth deep-link landing — leave it alone while
    // the code exchange runs; the status flip below routes the user out.
    const onAuthCallback =
      (segments[0] as string) === "auth" &&
      (segments[1] as string) === "callback";
    if (status === "signedOut" && !inAuthGroup && !onAuthCallback) {
      router.replace("/(auth)/sign-in" as never);
    } else if (status === "signedIn" && (inAuthGroup || onAuthCallback)) {
      router.replace("/(tabs)");
    }
  }, [status, segments, router]);

  if (status === "loading") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: palette.bg,
        }}
      >
        <ActivityIndicator color={palette.teal} size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.bg },
        headerTintColor: palette.text,
        contentStyle: { backgroundColor: palette.bg },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ title: "Back", headerShown: false }} />
      <Stack.Screen
        name="painting/import"
        options={{ title: "Import from URL", presentation: "modal" }}
      />
      <Stack.Screen
        name="painting/wishlist-import"
        options={{ title: "Import wishlist", presentation: "modal" }}
      />
      <Stack.Screen
        name="painting/wishlist-refresh"
        options={{ title: "Refresh wishlist", presentation: "modal" }}
      />
      <Stack.Screen name="painting/new" options={{ title: "Add painting" }} />
      <Stack.Screen name="painting/[id]" options={{ title: "Painting" }} />
      <Stack.Screen
        name="painting/[id]/edit"
        options={{ title: "Edit painting" }}
      />
      <Stack.Screen
        name="painting/[id]/complete"
        options={{ title: "Mark complete", presentation: "modal" }}
      />
      <Stack.Screen
        name="export"
        options={{ title: "Export backup", presentation: "modal" }}
      />
      <Stack.Screen
        name="account"
        options={{ title: "Settings", presentation: "modal" }}
      />
      <Stack.Screen name="restocks" options={{ title: "Back in stock" }} />
      <Stack.Screen
        name="discover/dac-archived"
        options={{ title: "DAC archive" }}
      />
      <Stack.Screen name="drill/new" options={{ title: "Add drill" }} />
      <Stack.Screen name="drill/[id]" options={{ title: "Drill" }} />
      <Stack.Screen
        name="drill/[id]/edit"
        options={{ title: "Edit drill" }}
      />
    </Stack>
  );
}
