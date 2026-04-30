// Form field wrapper: label on top, slot below, optional helper text.

import { Text, VStack } from "@gluestack-ui/themed";
import type { ReactNode } from "react";

import { palette } from "@/src/theme/colors";

interface FieldProps {
  label: string;
  helper?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, helper, required, children }: FieldProps) {
  return (
    <VStack space="xs">
      <Text size="xs" color={palette.textSubtle} fontWeight="$semibold">
        {label.toUpperCase()}
        {required ? " *" : ""}
      </Text>
      {children}
      {helper ? (
        <Text size="xs" color={palette.textSubtle}>
          {helper}
        </Text>
      ) : null}
    </VStack>
  );
}
