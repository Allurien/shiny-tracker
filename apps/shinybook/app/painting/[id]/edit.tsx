import { Box, Text } from "@gluestack-ui/themed";
import { router, useLocalSearchParams } from "expo-router";

import { PaintingForm } from "@/src/components/PaintingForm";
import { getPainting, updatePainting } from "@/src/repo/paintings";
import { useAsyncFocus } from "@/src/hooks/useAsyncFocus";
import { palette } from "@/src/theme/colors";

export default function EditPaintingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: painting, loading } = useAsyncFocus(
    () => getPainting(id!),
    [id]
  );

  if (loading && !painting) {
    return (
      <Box flex={1} bg="$background0" alignItems="center" justifyContent="center">
        <Text color={palette.textMuted}>Loading…</Text>
      </Box>
    );
  }

  if (!painting) {
    return (
      <Box flex={1} bg="$background0" alignItems="center" justifyContent="center">
        <Text color={palette.textMuted}>Painting not found.</Text>
      </Box>
    );
  }

  return (
    <Box flex={1} bg="$background0">
      <PaintingForm
        initial={painting}
        submitLabel="Save changes"
        onSubmit={async (values) => {
          await updatePainting(painting.id, values);
          router.back();
        }}
        onCancel={() => router.back()}
      />
    </Box>
  );
}
