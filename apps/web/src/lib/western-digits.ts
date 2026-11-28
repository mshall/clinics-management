/**
 * One Arabic numeral default (founder decision 28 Nov 2026): Western digits 0-9 on every surface, in Arabic and in English.
 * Arabic locales format with Arabic-Indic digits unless the locale carries `-u-nu-latn`; rather than touching every call site, this module installs ONCE
 * (import it first in the app entry) a thin wrapper that adds `-u-nu-latn` to every Arabic locale used by Intl.NumberFormat / DateTimeFormat / RelativeTimeFormat
 * and by Number/Date `toLocale*String`. An explicit `numberingSystem` option or an explicit `-nu-` extension always wins (a user choice such as the Clinic toggle).
 * With no locale given, the document language (then the browser language) is used, so an English page never inherits the device's Arabic digits.
 * Vendored copy: edit `_brand/numerals/western-digits.ts` and copy it; do not fork. Idempotent and a no-op where Intl is missing.
 */
const MARK = "__kxWesternDigits";

export function westernLocale(loc: unknown, options?: { numberingSystem?: string } | null): unknown {
  if (options && typeof options === "object" && options.numberingSystem) return loc;
  // A user choice wins: the Clinic numerals toggle sets <html data-numerals="arab"> (default "latn").
  if (typeof document !== "undefined" && document.documentElement.dataset.numerals === "arab") return loc;
  const one = (l: unknown): unknown => {
    if (typeof l !== "string") return l;
    if (!/^ar(-|$)/i.test(l) || /-nu-/i.test(l)) return l;
    return /-u-/i.test(l) ? `${l}-nu-latn` : `${l}-u-nu-latn`;
  };
  if (loc === undefined || loc === null) {
    const doc = typeof document !== "undefined" ? document.documentElement.lang : "";
    const nav = typeof navigator !== "undefined" ? navigator.language : "";
    const base = doc || nav;
    return base ? one(base) : loc;
  }
  return Array.isArray(loc) ? loc.map(one) : one(loc);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- a constructor wrapper must stay generic over the three Intl constructors */
function wrapCtor(orig: any): any {
  return new Proxy(orig, {
    construct: (t: any, args: any[], nt: any) => Reflect.construct(t, [westernLocale(args[0], args[1]), args[1]], nt),
    apply: (t: any, thisArg: any, args: any[]) => Reflect.apply(t, thisArg, [westernLocale(args[0], args[1]), args[1]]),
  });
}

export function installWesternDigits(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof Intl === "undefined" || g[MARK]) return;
  g[MARK] = true;
  try {
    const I = Intl as any;
    for (const k of ["NumberFormat", "DateTimeFormat", "RelativeTimeFormat"]) if (typeof I[k] === "function") I[k] = wrapCtor(I[k]);
    const patch = (proto: any, name: string) => {
      const orig = proto[name];
      if (typeof orig !== "function") return;
      Object.defineProperty(proto, name, { configurable: true, writable: true, value: function (this: unknown, loc?: unknown, opts?: { numberingSystem?: string }) { return orig.call(this, westernLocale(loc, opts), opts); } });
    };
    patch(Number.prototype, "toLocaleString");
    for (const n of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]) patch(Date.prototype, n);
    if (typeof BigInt !== "undefined") patch(BigInt.prototype, "toLocaleString");
  } catch { /* never block the app over a formatting nicety */ }
}

installWesternDigits();
