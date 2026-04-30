// Compact single-select chip + bottom-sheet modal. Used for sort ("Sort:
// Recently updated") and filter ("Artist: Any") pickers alike. Works on web
// (RN-Web Modal) and native.

import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import {
  Box,
  HStack,
  Pressable,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { Modal, ScrollView } from "react-native";
import { useState } from "react";

import { palette } from "@/src/theme/colors";

type IconName = ComponentProps<typeof Ionicons>["name"];

export interface SortOption<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  options: SortOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // Header shown above the option list in the sheet. Defaults to "SORT BY"
  // so existing sort callers don't need to pass it.
  header?: string;
  // Leading icon on the trigger chip. Defaults to swap-vertical (sort).
  icon?: IconName;
}

export function SortMenu<T extends string>({
  options,
  value,
  onChange,
  header = "SORT BY",
  icon = "swap-vertical",
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value) ?? options[0];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        px="$3"
        py="$1.5"
        borderRadius="$full"
        borderWidth={1}
        borderColor={palette.border}
        bg={palette.surface}
      >
        <HStack space="xs" alignItems="center">
          <Ionicons name={icon} size={14} color={palette.textMuted} />
          <Text size="sm" color={palette.textMuted}>
            {current?.label ?? ""}
          </Text>
        </HStack>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
          onPress={() => setOpen(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Box
              bg={palette.bg}
              borderTopLeftRadius="$2xl"
              borderTopRightRadius="$2xl"
              borderWidth={1}
              borderColor={palette.border}
              p="$4"
              pb="$6"
              maxHeight={520}
            >
              <Text
                size="xs"
                color={palette.textSubtle}
                fontWeight="$semibold"
                style={{ letterSpacing: 1 }}
                mb="$2"
              >
                {header}
              </Text>
              <ScrollView
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                <VStack space="xs">
                  {options.map((opt) => {
                    const active = opt.id === value;
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => {
                          onChange(opt.id);
                          setOpen(false);
                        }}
                        px="$3"
                        py="$3"
                        borderRadius="$md"
                        bg={active ? `${palette.teal}22` : "transparent"}
                      >
                        <HStack space="sm" alignItems="center">
                          <Ionicons
                            name={active ? "radio-button-on" : "radio-button-off"}
                            size={18}
                            color={active ? palette.teal : palette.textSubtle}
                          />
                          <Text
                            color={active ? palette.teal : palette.text}
                            fontWeight={active ? "$semibold" : "$normal"}
                          >
                            {opt.label}
                          </Text>
                        </HStack>
                      </Pressable>
                    );
                  })}
                </VStack>
              </ScrollView>
            </Box>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
