import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { fetchOnboardingProgress, type OnboardingStepKey } from "@/lib/onboarding-api";

/**
 * Quick-setup session (per browser tab). The checklist deep-links to `?setup=<key>&entity=<id>`; the shell stores that here so the
 * contextual bar survives pages that rewrite their own query string, and so the checklist can animate the step that just finished.
 */
export type SetupSession = { key: OnboardingStepKey; entity: string | null; path: string; returnTo: string; startedPending: boolean | null };

const ACTIVE = "kx.setup.active";
const JUST_DONE = "kx.setup.justDone";
const SKIPPED = "kx.setup.skipped";
const listeners = new Set<() => void>();

function read<T>(k: string): T | null {
  try {
    const raw = sessionStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown | null) {
  try {
    if (v == null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable: the bar simply does not persist */
  }
  listeners.forEach((l) => l());
}

let cache: { raw: string | null; value: SetupSession | null } = { raw: null, value: null };
function snapshot(): SetupSession | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(ACTIVE);
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, value: raw ? (JSON.parse(raw) as SetupSession) : null };
  return cache.value;
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export function useSetupSession(): SetupSession | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
export const setSetupSession = (s: SetupSession | null) => write(ACTIVE, s);
export const getSetupSession = () => snapshot();

export type JustDone = { key: OnboardingStepKey; entity: string | null };
export const markJustDone = (j: JustDone) => write(JUST_DONE, j);
export function takeJustDone(): JustDone | null {
  const v = read<JustDone>(JUST_DONE);
  if (v) write(JUST_DONE, null);
  return v;
}
/** "Skip for now" keeps the step pending but moves the highlight on to the next one. */
export const markSkippedForNow = (key: OnboardingStepKey) => write(SKIPPED, key);
export const getSkippedForNow = () => read<OnboardingStepKey>(SKIPPED);
export const clearSkippedForNow = () => write(SKIPPED, null);

export function parseSetupSearch(search: string): { key: OnboardingStepKey; entity: string | null } | null {
  const p = new URLSearchParams(search);
  const key = p.get("setup");
  return key ? { key: key as OnboardingStepKey, entity: p.get("entity") } : null;
}

/**
 * Re-evaluates the checklist right after any successful save anywhere in the app (no reload): every successful mutation debounces an
 * invalidation of the onboarding query, which the server recomputes from real data.
 */
export function useOnboardingAutoRefresh(enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = qc.getMutationCache().subscribe((e) => {
      if (e.type === "updated" && e.action.type === "success") {
        clearTimeout(t);
        t = setTimeout(() => void qc.invalidateQueries({ queryKey: ["onboarding"] }), 350);
      }
    });
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, [qc, enabled]);
}

/** `fast`: while a setup step is open the list is re-checked every 4 s, so work finished outside this tab (or by a background job) is noticed without a reload. */
export function useOnboardingQuery(enabled = true, fast = false) {
  return useQuery({
    queryKey: ["onboarding"],
    queryFn: fetchOnboardingProgress,
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: fast ? 4_000 : 30_000,
  });
}
