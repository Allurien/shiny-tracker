// Floating action button anchored bottom-right. Pure custom (avoids the
// Gluestack <Fab>'s reliance on @react-native-aria/button for web).

import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "@gluestack-ui/themed";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet } from "react-native";

import { brandGradient, palette } from "@/src/theme/colors";

interface FabProps {
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

export function Fab({ icon = "add", onPress }: FabProps) {
  return (
    <Pressable
      onPress={onPress}
      position="absolute"
      bottom="$4"
      right="$4"
      borderRadius="$full"
      // Slightly elevated visual via shadow on native + outline on web
      shadowColor={palette.purple}
      shadowOffset={{ width: 0, height: 6 }}
      shadowOpacity={0.5}
      shadowRadius={12}
      elevation={8}
    >
      <LinearGradient
        colors={brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.button}
      >
        <Ionicons name={icon} size={28} color={palette.text} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});
