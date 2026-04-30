import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs, router } from "expo-router";
import { Pressable, View } from "react-native";

import { brandGradient, palette } from "@/src/theme/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerTintColor: palette.text,
        // Each tab screen renders its own hero/title, so the header bar's
        // text would be redundant. Drop just the title — keep the bar so the
        // account icon (headerRight) and safe-area still work.
        headerTitle: "",
        headerShadowVisible: false,
        // Subtle dark vertical gradient with a thin brand-colored accent line
        // along the bottom edge — keeps the bar from feeling like a flat black
        // box and visually connects into the colorful hero below.
        headerBackground: () => (
          <View style={{ flex: 1, backgroundColor: palette.bg }}>
            <LinearGradient
              colors={[palette.bg, palette.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            />
            <LinearGradient
              colors={brandGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 1.5,
                opacity: 0.7,
              }}
            />
          </View>
        ),
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
        },
        tabBarActiveTintColor: palette.teal,
        tabBarInactiveTintColor: palette.textSubtle,
        headerRight: () => (
          <Pressable
            hitSlop={12}
            onPress={() => router.push("/account" as never)}
            style={{ paddingHorizontal: 16 }}
          >
            <Ionicons
              name="person-circle-outline"
              size={26}
              color={palette.text}
            />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Stash",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: "Wishlist",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="logbook"
        options={{
          title: "Logbook",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="drills"
        options={{
          title: "Drills",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="color-palette-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
