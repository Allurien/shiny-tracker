// Scrollable grid of all 468 DMC color swatches. Tapping a swatch fills
// the drill number, color name, and color hex, then closes the picker.

import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DMC_COLORS } from "@/src/data/dmcColors";
import { palette } from "@/src/theme/colors";

interface DmcEntry {
  number: string;
  name: string;
  hex: string;
}

const ALL_COLORS: DmcEntry[] = Object.entries(DMC_COLORS).map(([number, c]) => ({
  number,
  name: c.name,
  hex: c.hex,
}));

const NUM_COLS = 5;
const H_PADDING = 12;
const GAP = 6;

// Perceived luminance — used to pick a readable checkmark color.
function isLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

export interface DmcSelection {
  number: string;
  name: string;
  hex: string;
}

interface DmcColorPickerProps {
  visible: boolean;
  selectedHex?: string;
  onSelect: (entry: DmcSelection) => void;
  onClose: () => void;
}

export function DmcColorPicker({
  visible,
  selectedHex,
  onSelect,
  onClose,
}: DmcColorPickerProps) {
  const { width } = useWindowDimensions();
  const swatchSize = Math.floor(
    (width - H_PADDING * 2 - GAP * (NUM_COLS - 1)) / NUM_COLS
  );

  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ALL_COLORS;
    return ALL_COLORS.filter(
      (c) =>
        c.number.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
    );
  }, [search]);

  const handleSelect = (entry: DmcEntry) => {
    onSelect(entry);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>DMC Colors</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by number or name…"
            placeholderTextColor={palette.textSubtle}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.number}
          numColumns={NUM_COLS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const selected = item.hex === selectedHex;
            const light = isLight(item.hex);
            const checkColor = light ? "#000" : "#fff";
            return (
              <Pressable
                onPress={() => handleSelect(item)}
                style={[styles.swatchWrap, { width: swatchSize }]}
              >
                <View
                  style={[
                    styles.swatch,
                    {
                      width: swatchSize,
                      height: swatchSize,
                      borderRadius: swatchSize / 2,
                      backgroundColor: item.hex,
                      borderWidth: selected ? 2.5 : 1,
                      borderColor: selected ? palette.teal : "rgba(255,255,255,0.15)",
                    },
                  ]}
                >
                  {selected ? (
                    <Text style={[styles.check, { color: checkColor }]}>✓</Text>
                  ) : null}
                </View>
                <Text style={styles.numLabel} numberOfLines={1}>
                  {item.number}
                </Text>
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "600",
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    color: palette.textMuted,
    fontSize: 20,
  },
  searchWrap: {
    paddingHorizontal: H_PADDING,
    paddingVertical: 8,
  },
  searchInput: {
    backgroundColor: palette.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: palette.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: palette.border,
  },
  grid: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 32,
  },
  row: {
    gap: GAP,
    marginBottom: GAP,
  },
  swatchWrap: {
    alignItems: "center",
    gap: 3,
  },
  swatch: {
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    fontSize: 14,
    fontWeight: "700",
  },
  numLabel: {
    color: palette.textSubtle,
    fontSize: 10,
    textAlign: "center",
  },
});
