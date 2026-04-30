// Export a JSON snapshot of the local DB. Web gets a file download; native
// routes through Share.share so the user can AirDrop/save to files/email.

import { Ionicons } from "@expo/vector-icons";
import {
  Box,
  Button,
  ButtonText,
  HStack,
  Heading,
  Text,
  Textarea,
  TextareaInput,
  VStack,
} from "@gluestack-ui/themed";
import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, Share, StyleSheet } from "react-native";

import { buildBackup, type Backup } from "@/src/db/backup";
import { palette } from "@/src/theme/colors";

export default function ExportScreen() {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [json, setJson] = useState("");

  useEffect(() => {
    buildBackup().then((b) => {
      setBackup(b);
      setJson(JSON.stringify(b, null, 2));
    });
  }, []);

  const share = async () => {
    if (!json) return;
    if (Platform.OS === "web") {
      downloadOnWeb(json);
      return;
    }
    try {
      await Share.share({
        title: "ShinyBook backup",
        message: json,
      });
    } catch (err) {
      Alert.alert("Share failed", (err as Error).message);
    }
  };

  const copy = async () => {
    if (!json) return;
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(json);
      Alert.alert("Copied", "Backup copied to clipboard.");
      return;
    }
    // Native fallback — use Share sheet; there's no first-party clipboard
    // without pulling in another package.
    await share();
  };

  return (
    <Box flex={1} bg="$background0">
      <ScrollView contentContainerStyle={styles.content}>
        <VStack space="lg">
          <VStack space="xs">
            <Heading size="lg" color={palette.text}>
              Export backup
            </Heading>
            <Text color={palette.textMuted}>
              Everything lives locally. Save this JSON somewhere safe — it's your only backup.
            </Text>
          </VStack>

          {backup ? (
            <HStack space="sm" flexWrap="wrap">
              <Stat label="Paintings" value={backup.paintings.length} />
              <Stat label="Drills" value={backup.drills.length} />
              <Stat label="Sessions" value={backup.sessions.length} />
            </HStack>
          ) : (
            <Text color={palette.textMuted}>Preparing…</Text>
          )}

          <HStack space="md">
            <Button
              flex={1}
              bg={palette.purple}
              onPress={share}
              isDisabled={!json}
            >
              <HStack space="xs" alignItems="center">
                <Ionicons
                  name={Platform.OS === "web" ? "download-outline" : "share-outline"}
                  size={16}
                  color={palette.text}
                />
                <ButtonText>
                  {Platform.OS === "web" ? "Download JSON" : "Share"}
                </ButtonText>
              </HStack>
            </Button>
            <Button
              flex={1}
              variant="outline"
              action="secondary"
              onPress={copy}
              isDisabled={!json}
            >
              <HStack space="xs" alignItems="center">
                <Ionicons
                  name="copy-outline"
                  size={16}
                  color={palette.text}
                />
                <ButtonText>Copy</ButtonText>
              </HStack>
            </Button>
          </HStack>

          <VStack space="xs">
            <Text size="xs" color={palette.textSubtle} fontWeight="$semibold" style={{ letterSpacing: 1 }}>
              RAW JSON
            </Text>
            <Textarea
              bg={palette.surface}
              borderColor={palette.border}
              minHeight={320}
            >
              <TextareaInput
                color={palette.text}
                value={json}
                editable={false}
                multiline
                style={styles.mono}
              />
            </Textarea>
          </VStack>
        </VStack>
      </ScrollView>
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Box
      bg={palette.surface}
      borderRadius="$lg"
      borderWidth={1}
      borderColor={palette.border}
      px="$3"
      py="$3"
      minWidth={100}
      flexGrow={1}
      flexBasis="30%"
    >
      <Text size="xs" color={palette.textSubtle}>
        {label}
      </Text>
      <Text color={palette.text} fontWeight="$bold" size="2xl">
        {value}
      </Text>
    </Box>
  );
}

function downloadOnWeb(content: string) {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shinybook-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12 },
});
