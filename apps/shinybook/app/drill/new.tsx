import { Box } from "@gluestack-ui/themed";
import { router } from "expo-router";

import { DrillForm } from "@/src/components/DrillForm";
import { createDrill } from "@/src/repo/drills";
import type { Drill } from "@/src/types/drill";

export default function NewDrillScreen() {
  return (
    <Box flex={1} bg="$background0">
      <DrillForm
        submitLabel="Add drill"
        onSubmit={async (values) => {
          const created = await createDrill(
            values as Omit<Drill, "id" | "createdAt" | "updatedAt">
          );
          router.replace(`/drill/${created.id}`);
        }}
        onCancel={() => router.back()}
      />
    </Box>
  );
}
