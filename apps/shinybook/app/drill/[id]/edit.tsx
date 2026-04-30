import { Box, Text } from "@gluestack-ui/themed";
import { router, useLocalSearchParams } from "expo-router";

import { DrillForm } from "@/src/components/DrillForm";
import { getDrill, updateDrill } from "@/src/repo/drills";
import { useAsyncFocus } from "@/src/hooks/useAsyncFocus";
import { palette } from "@/src/theme/colors";

export default function EditDrillScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: drill, loading } = useAsyncFocus(
    () => getDrill(id!),
    [id]
  );

  if (loading && !drill) {
    return (
      <Box flex={1} bg="$background0" alignItems="center" justifyContent="center">
        <Text color={palette.textMuted}>Loading…</Text>
      </Box>
    );
  }

  if (!drill) {
    return (
      <Box flex={1} bg="$background0" alignItems="center" justifyContent="center">
        <Text color={palette.textMuted}>Drill not found.</Text>
      </Box>
    );
  }

  return (
    <Box flex={1} bg="$background0">
      <DrillForm
        initial={drill}
        submitLabel="Save changes"
        onSubmit={async (values) => {
          await updateDrill(drill.id, values);
          router.back();
        }}
        onCancel={() => router.back()}
      />
    </Box>
  );
}
