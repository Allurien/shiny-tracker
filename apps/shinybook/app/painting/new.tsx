import { Box } from "@gluestack-ui/themed";
import { router } from "expo-router";

import { PaintingForm } from "@/src/components/PaintingForm";
import { createPainting } from "@/src/repo/paintings";
import { nowIso } from "@/src/db/client";
import type { Painting, PaintingPatch } from "@/src/types/painting";

export default function NewPaintingScreen() {
  return (
    <Box flex={1} bg="$background0">
      <PaintingForm
        submitLabel="Add painting"
        onSubmit={async (values) => {
          const created = await createPainting(
            withLifecycleDate(values) as Omit<Painting, "id" | "createdAt" | "updatedAt">
          );
          router.replace(`/painting/${created.id}`);
        }}
        onCancel={() => router.back()}
      />
    </Box>
  );
}

// Stamp the right lifecycle date when a manual entry starts in a non-default
// state (e.g. user chose "Done") — only if the user didn't already set one.
function withLifecycleDate(values: PaintingPatch): PaintingPatch {
  const now = nowIso();
  switch (values.status) {
    case "ordered":
      return { ...values, purchasedAt: values.purchasedAt ?? now };
    case "stash":
      return { ...values, receivedAt: values.receivedAt ?? now };
    case "in_progress":
      return { ...values, startedAt: values.startedAt ?? now };
    case "completed":
      return { ...values, completedAt: values.completedAt ?? now };
    default:
      return values;
  }
}
