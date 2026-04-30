// Generic horizontal chip row. Single-select; emits the selected value's id.

import { HStack, Pressable, Text } from "@gluestack-ui/themed";
import { ScrollView } from "react-native";

import { palette } from "@/src/theme/colors";

export interface ChipOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface FilterChipsProps<T extends string> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: FilterChipsProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16 }}
    >
      <HStack space="sm">
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <Pressable
              key={opt.id}
              onPress={() => onChange(opt.id)}
              px="$3"
              py="$1.5"
              borderRadius="$full"
              borderWidth={1}
              borderColor={active ? palette.teal : palette.border}
              bg={active ? `${palette.teal}22` : palette.surface}
            >
              <Text
                size="sm"
                color={active ? palette.teal : palette.textMuted}
                fontWeight={active ? "$semibold" : "$normal"}
              >
                {opt.label}
                {typeof opt.count === "number" ? `  ${opt.count}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </HStack>
    </ScrollView>
  );
}
