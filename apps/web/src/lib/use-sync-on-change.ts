import { useState } from "react";

/**
 * Runs `sync` (which may call this component's own state setters) during render whenever any value in `deps`
 * changes, instead of syncing state from an effect. This is React's recommended "adjust state when a prop changes"
 * pattern: the component re-renders immediately with the adjusted state, with no extra committed frame.
 *
 * By default `sync` also runs on the first render (matching `useEffect` semantics). Pass `{ skipMount: true }` when
 * the initial `useState` values are already correct.
 *
 * Only call own-state setters from `sync`; side effects on other components or external systems still belong in effects.
 */
export function useSyncOnChange(
  deps: readonly unknown[],
  sync: () => void,
  options?: { skipMount?: boolean },
): void {
  const [prev, setPrev] = useState<readonly unknown[] | null>(options?.skipMount ? deps : null);
  if (prev === null || prev.length !== deps.length || deps.some((d, i) => !Object.is(d, prev[i]))) {
    setPrev(deps);
    sync();
  }
}
