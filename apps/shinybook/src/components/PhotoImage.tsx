// Drop-in <Image> wrapper that resolves a "photo ref" to a renderable URL.
// A ref is either an S3 key (signed-on-demand), a local file URI, or a
// public HTTPS URL. See src/photos/url.ts for the discriminator + cache.
//
// While async resolution is pending, renders <Image> with no source so the
// styled placeholder shows. Errors log and result in the placeholder render.

import { Image, type ImageProps } from "expo-image";
import { useEffect, useState } from "react";

import { resolvePhotoUrl } from "@/src/photos/url";

type PassThroughProps = Omit<ImageProps, "source">;

interface Props extends PassThroughProps {
  photoRef: string | null | undefined;
}

export function PhotoImage({ photoRef, ...rest }: Props) {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (!photoRef) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    setResolved(null);
    resolvePhotoUrl(photoRef)
      .then((url) => {
        if (!cancelled) setResolved(url);
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[photos] resolve failed", { photoRef, err });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [photoRef]);

  return <Image {...rest} source={resolved ? { uri: resolved } : undefined} />;
}
