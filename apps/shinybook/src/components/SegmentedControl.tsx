// Inline single-select segmented control. Fills row width, equal-width
// segments. Used for enum form fields (status, drill shape).

import { HStack, Pressable, Text } from "@gluestack-ui/themed";

import { palette } from "@/src/theme/colors";

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <HStack
      bg={palette.surface}
      borderRadius="$lg"
      borderWidth={1}
      borderColor={palette.border}
      p="$1"
      space="xs"
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            flex={1}
            py="$2"
            borderRadius="$md"
            bg={active ? palette.surfaceAlt : "transparent"}
            borderWidth={active ? 1 : 0}
            borderColor={palette.teal}
          >
            <Text
              size="sm"
              textAlign="center"
              color={active ? palette.teal : palette.textMuted}
              fontWeight={active ? "$semibold" : "$normal"}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </HStack>
  );
}
