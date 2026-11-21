import { useEffect, useState } from "react";
import { useSyncOnChange } from "@/lib/use-sync-on-change";
import { ApiError, apiFetchBlob } from "@/lib/http";

export function useAuthenticatedImage(path: string | null | undefined, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useSyncOnChange([path, enabled], () => {
    if (!enabled || !path) {
      setUrl(null);
      setLoading(false);
    } else {
      setLoading(true);
    }
  });

  useEffect(() => {
    if (!enabled || !path) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    void apiFetchBlob(path)
      .then(({ blob }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        if (!(err instanceof ApiError && err.status === 404)) {
          console.error(err);
        }
        setUrl(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, enabled]);

  return { url, loading };
}
