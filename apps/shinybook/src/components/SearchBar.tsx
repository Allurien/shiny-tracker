// Inline search bar. Rendered below the hero when the header search icon
// is tapped. Auto-focuses; the trailing close button clears + hides.

import { Ionicons } from "@expo/vector-icons";
import { Box, HStack, Pressable } from "@gluestack-ui/themed";
import { TextInput } from "react-native";

import { palette } from "@/src/theme/colors";
import type { Painting } from "@/src/types/painting";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  onClose,
  placeholder = "Search by title, artist, brand…",
}: Props) {
  return (
    <Box px="$4" pt="$2" pb="$1">
      <HStack
        alignItems="center"
        bg={palette.surface}
        borderColor={palette.border}
        borderWidth={1}
        borderRadius="$md"
        px="$3"
      >
        <Ionicons name="search" size={16} color={palette.textSubtle} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={palette.textSubtle}
          style={{
            flex: 1,
            color: palette.text,
            paddingVertical: 10,
            paddingHorizontal: 8,
          }}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        <Pressable onPress={onClose} p="$1">
          <Ionicons name="close-circle" size={18} color={palette.textSubtle} />
        </Pressable>
      </HStack>
    </Box>
  );
}

// Case-insensitive substring match across the fields a user is most likely
// to search on. Returns true for empty queries so callers don't need to gate.
export function matchesQuery(p: Painting, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [p.title, p.brand, p.artist, p.notes]
    .filter((s): s is string => !!s)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}
