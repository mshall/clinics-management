/**
 * Minimal translate function shape accepted by pure helpers (and satisfied by i18next's `TFunction` and by test stubs).
 * Declared as two overloads because i18next 27 only has a `(key, default, options)` overload with *required* options.
 */
export type TranslateFn = {
  (key: string, fallback: string): string;
  (key: string, fallback: string, params: Record<string, unknown>): string;
};

/** Lookup-only variant: `t(key)` or `t(key, fallback)`. */
export type TranslateLookupFn = {
  (key: string): string;
  (key: string, fallback: string): string;
};
