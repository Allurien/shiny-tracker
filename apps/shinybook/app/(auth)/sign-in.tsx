import { Ionicons } from "@expo/vector-icons";
import { Box, Button, ButtonText, Heading, Text, VStack } from "@gluestack-ui/themed";
import { useState } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";

import { SparkleIcon } from "@/src/components/SparkleIcon";
import { useAuth } from "@/src/auth/provider";
import { palette } from "@/src/theme/colors";

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box flex={1} bg={palette.bg} justifyContent="center" px="$6">
      <Box style={styles.logoBadge}>
        <SparkleIcon size={88} color={palette.blue} />
      </Box>

      <VStack space="xs" alignItems="center">
        <Heading color={palette.text} size="2xl" textAlign="center">
          ShinyBook
        </Heading>
        <Text color={palette.textMuted} textAlign="center" size="md">
          Crafting Tracker
        </Text>
        <Text color={palette.textMuted} textAlign="center" mt="$3">
          Track your diamond paintings, drills, and progress.
        </Text>

        <Button
          onPress={onPress}
          isDisabled={busy}
          size="lg"
          mt="$6"
          bg={palette.surface}
          borderColor={palette.border}
          borderWidth={1}
          $active-bg={palette.surfaceAlt}
          width="100%"
        >
          {busy ? (
            <ActivityIndicator color={palette.text} />
          ) : (
            <>
              <Ionicons
                name="logo-google"
                size={18}
                color={palette.text}
                style={{ marginRight: 12 }}
              />
              <ButtonText color={palette.text}>Continue with Google</ButtonText>
            </>
          )}
        </Button>

        {error && (
          <Text color={palette.danger} textAlign="center" mt="$2">
            {error}
          </Text>
        )}
      </VStack>
    </Box>
  );
}

const styles = StyleSheet.create({
  logoBadge: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 24,
  },
});
