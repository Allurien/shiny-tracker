// Progress-photo grid. Photos stored on the painting are "photo refs" —
// either S3 keys (post-upload) or local file URIs (pending upload). See
// src/photos/url.ts for resolution.
//
// On pick: we add the local URIs to the list immediately (instant visual
// feedback) and upload to S3 in the background. As each upload completes,
// we swap the local URI for the returned S3 key via another onChange call.
// If the upload fails, the local URI stays in the painting record so the
// photo isn't lost — a later retry can re-upload it.

import { Ionicons } from "@expo/vector-icons";
import { Box, HStack, Pressable, Text, VStack } from "@gluestack-ui/themed";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef } from "react";
import { Alert, Platform, StyleSheet } from "react-native";

import { uploadPickedPhoto } from "@/src/photos/upload";
import { palette } from "@/src/theme/colors";

import { PhotoImage } from "./PhotoImage";

interface Props {
  paintingId: string;
  photos: string[];
  onChange: (next: string[]) => void;
  onPhotoPress?: (photoRef: string) => void;
}

const TILE_SIZE = 104;

export function PhotoGrid({ paintingId, photos, onChange, onPhotoPress }: Props) {
  // Keep a ref to the latest photos array so background uploads can compute
  // their swap relative to the current state, not the closure-captured one.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const add = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (Platform.OS !== "web") {
        Alert.alert("Permission needed", "Allow photo access to attach progress pictures.");
      }
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (result.canceled) return;

    const assets = result.assets;
    const localUris = assets.map((a) => a.uri);
    onChange([...photosRef.current, ...localUris]);

    // Background uploads. Each swap is its own onChange so individual
    // failures don't lose the rest.
    for (const asset of assets) {
      uploadPickedPhoto({
        paintingId,
        localUri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName ?? undefined,
      })
        .then((key) => {
          const current = photosRef.current;
          const idx = current.indexOf(asset.uri);
          if (idx === -1) return; // user removed the photo before upload finished
          const next = [...current];
          next[idx] = key;
          onChange(next);
        })
        .catch((err) => {
          console.warn("[photos] upload failed", { uri: asset.uri, err });
        });
    }
  };

  const remove = (ref: string) => {
    const doIt = () => onChange(photosRef.current.filter((p) => p !== ref));
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Remove this photo?")) doIt();
      return;
    }
    Alert.alert("Remove photo?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: doIt },
    ]);
  };

  return (
    <HStack space="sm" flexWrap="wrap">
      {photos.map((ref) => (
        <Pressable
          key={ref}
          onPress={() => onPhotoPress?.(ref)}
          onLongPress={() => remove(ref)}
        >
          <Box style={styles.tile} bg={palette.surfaceAlt}>
            <PhotoImage photoRef={ref} style={styles.tile} contentFit="cover" />
            <Pressable
              onPress={() => remove(ref)}
              style={styles.removeBtn}
              bg={palette.bg}
            >
              <Ionicons name="close" size={14} color={palette.text} />
            </Pressable>
          </Box>
        </Pressable>
      ))}
      <Pressable onPress={add}>
        <Box
          style={styles.tile}
          bg={palette.surface}
          borderWidth={1}
          borderColor={palette.border}
          borderRadius={12}
          alignItems="center"
          justifyContent="center"
        >
          <VStack space="xs" alignItems="center">
            <Ionicons name="add" size={22} color={palette.teal} />
            <Text size="xs" color={palette.textSubtle}>
              Add
            </Text>
          </VStack>
        </Box>
      </Pressable>
    </HStack>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 12,
    overflow: "hidden",
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.8,
  },
});
