import { useEffect, useState } from "react";

/**
 * Current wall-clock time (ms), refreshed on an interval. Use instead of calling `Date.now()` during render
 * (which is impure); suitable for coarse "is in the past" / "days left" display values.
 */
export function useNowMs(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
