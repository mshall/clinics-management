import { useEffect, useRef } from "react";

export type Shortcut = {
  /** `KeyboardEvent.key`, compared case-insensitively. */
  key: string;
  alt?: boolean;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  mod?: boolean;
  /** Fire even while typing in an input/textarea/select (only sensible with alt or mod). */
  allowInInputs?: boolean;
  handler: (e: KeyboardEvent) => void;
};

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function matchesShortcut(e: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "code">, s: Shortcut): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (Boolean(s.mod) !== mod || Boolean(s.alt) !== e.altKey) return false;
  if (e.key.toLowerCase() === s.key.toLowerCase()) return true;
  // Alt+digit on macOS yields symbols (e.g. "¡"); fall back to the physical key.
  return /^\d$/.test(s.key) && e.code === `Digit${s.key}`;
}

/** Desktop keyboard shortcuts; ignored while typing unless `allowInInputs`. */
export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true): void {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      for (const s of ref.current) {
        if (!matchesShortcut(e, s)) continue;
        if (isTypingTarget(e.target) && !s.allowInInputs) continue;
        e.preventDefault();
        s.handler(e);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
