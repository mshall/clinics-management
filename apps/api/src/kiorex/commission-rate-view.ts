/**
 * COM-2 provider-side rate view (pure). Kiorex sets the commission rate (default per organisation type, override per organisation, maker-checker); this product only displays it.
 * The history rows arrive with their start time, so the effective rate is computed here at read time: a change that was future-dated takes effect by itself, and an old instant keeps the old rate.
 * Nothing here is a rate of its own: with no active row the answer is NOT_SET (no commission is charged, "rate not set").
 */
export type RateSpecView = { feeType: "PERCENT" | "FLAT"; percentBps: number | null; flatMinor: number | null; minMinor: number | null; maxMinor: number | null; mode: string | null };
export type RateHistoryRow = { version: number; scope: "DEFAULT" | "ORG"; kind: "RATE" | "INHERIT"; effectiveFrom: string; reason: string | null; spec: RateSpecView | null };
export type EffectiveRateView = { state: "SET" | "NOT_SET"; source: "OVERRIDE" | "DEFAULT" | null; version: number | null; effectiveFrom: string | null; reason: string | null; spec: RateSpecView | null };
export const NOT_SET_VIEW: EffectiveRateView = { state: "NOT_SET", source: null, version: null, effectiveFrom: null, reason: null, spec: null };

const inForce = (rows: RateHistoryRow[], at: Date): RateHistoryRow | null => {
  const live = rows.filter((r) => new Date(r.effectiveFrom).getTime() <= at.getTime());
  live.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime() || b.version - a.version);
  return live[0] ?? null;
};

export function effectiveRateAt(history: RateHistoryRow[], at: Date): EffectiveRateView {
  const o = inForce(history.filter((r) => r.scope === "ORG"), at);
  if (o && o.kind === "RATE" && o.spec) return { state: "SET", source: "OVERRIDE", version: o.version, effectiveFrom: o.effectiveFrom, reason: o.reason, spec: o.spec };
  const d = inForce(history.filter((r) => r.scope === "DEFAULT"), at);
  if (d && d.kind === "RATE" && d.spec) return { state: "SET", source: "DEFAULT", version: d.version, effectiveFrom: d.effectiveFrom, reason: null, spec: d.spec };
  return NOT_SET_VIEW;
}

/** Validation of what Kiorex pushes: a malformed view is refused whole rather than shown half. */
export function rateViewProblems(b: unknown): string[] {
  if (!b || typeof b !== "object") return ["body must be an object"];
  const o = b as Record<string, unknown>;
  const out: string[] = [];
  if (typeof o.orgRef !== "string" || !o.orgRef) out.push("orgRef is required");
  if (!["CLINIC", "PHARMACY", "LAB"].includes(String(o.product))) out.push("product must be CLINIC, PHARMACY or LAB");
  if (typeof o.version !== "string" || !/^\d{1,18}$/.test(o.version)) out.push("version must be a numeric string");
  if (!Array.isArray(o.history)) out.push("history must be an array");
  else for (const [i, r] of (o.history as unknown[]).entries()) {
    const h = r as Record<string, unknown>;
    if (!h || typeof h.version !== "number" || !["DEFAULT", "ORG"].includes(String(h.scope)) || !["RATE", "INHERIT"].includes(String(h.kind)) || Number.isNaN(Date.parse(String(h.effectiveFrom)))) out.push(`history[${i}] is malformed`);
    else if (h.kind === "RATE") {
      const s = h.spec as Record<string, unknown> | null;
      if (!s || !["PERCENT", "FLAT"].includes(String(s.feeType))) out.push(`history[${i}].spec is malformed`);
    }
  }
  return out;
}

/** Commission of one charge in minor units under an effective rate: percent of the fee basis (round half up on exact integers) or the flat amount, then the floor and the cap. Same arithmetic as the Kiorex side and the contract vectors. */
export function commissionAmountMinor(basisMinor: number, spec: RateSpecView): number {
  let v = spec.feeType === "FLAT" ? (spec.flatMinor ?? 0) : Math.floor((basisMinor * (spec.percentBps ?? 0) * 2 + 10_000) / 20_000);
  if (spec.minMinor != null) v = Math.max(v, spec.minMinor);
  if (spec.maxMinor != null) v = Math.min(v, spec.maxMinor);
  return v;
}
