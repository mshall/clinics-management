/**
 * KNREC02 / KNESC01 — vitals ranges and critical-value escalation. Thresholds come from the market pack (`Market.clinicalConfig.vitalsThresholds`,
 * CMO-signed). The shipped baseline below is a PLACEHOLDER (adult, generic): `cmoSignOff` is null and stays null until a named CMO signs (gate
 * GKN1, NEEDS_HUMAN). Critical-value escalation is a safety control, never a flag; nurses get "call the doctor / call 123" guidance, never AI advice.
 */
export type VitalKey = "systolic" | "diastolic" | "pulse" | "temperatureC" | "spo2" | "respiratoryRate" | "glucoseMgDl" | "painScore";
export type Range = { low?: number; high?: number; criticalLow?: number; criticalHigh?: number };
export type VitalsThresholds = { version: string; cmoSignOff: { by: string; at: string } | null; ranges: Record<VitalKey, Range> };
export type VitalFlag = "LOW" | "HIGH" | "CRITICAL_LOW" | "CRITICAL_HIGH";
export type VitalsInput = Partial<Record<VitalKey, number | null | undefined>>;

export const BASELINE_VITALS_THRESHOLDS: VitalsThresholds = {
  version: "2026-11-20.placeholder",
  cmoSignOff: null,
  ranges: {
    systolic: { low: 90, high: 140, criticalLow: 80, criticalHigh: 180 },
    diastolic: { low: 60, high: 90, criticalLow: 50, criticalHigh: 120 },
    pulse: { low: 50, high: 100, criticalLow: 40, criticalHigh: 130 },
    temperatureC: { low: 36.1, high: 37.8, criticalLow: 35, criticalHigh: 39.5 },
    spo2: { low: 94, criticalLow: 90 },
    respiratoryRate: { low: 12, high: 20, criticalLow: 8, criticalHigh: 30 },
    glucoseMgDl: { low: 70, high: 180, criticalLow: 54, criticalHigh: 400 },
    painScore: { high: 6, criticalHigh: 9 },
  },
};

export const VITAL_KEYS = Object.keys(BASELINE_VITALS_THRESHOLDS.ranges) as VitalKey[];

export function resolveVitalsThresholds(market: { clinicalConfig?: unknown } | null | undefined): VitalsThresholds {
  const cfg = market?.clinicalConfig;
  if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
    const raw = (cfg as Record<string, unknown>).vitalsThresholds as Partial<VitalsThresholds> | undefined;
    if (raw?.ranges && typeof raw.version === "string") {
      return { version: raw.version, cmoSignOff: raw.cmoSignOff ?? null, ranges: { ...BASELINE_VITALS_THRESHOLDS.ranges, ...raw.ranges } };
    }
  }
  return BASELINE_VITALS_THRESHOLDS;
}

const HARD_LIMITS: Record<VitalKey, [number, number]> = {
  systolic: [30, 300],
  diastolic: [20, 200],
  pulse: [10, 300],
  temperatureC: [25, 45],
  spo2: [30, 100],
  respiratoryRate: [2, 80],
  glucoseMgDl: [10, 1500],
  painScore: [0, 10],
};

/** Rejects physically impossible entries (typos), not clinically abnormal ones. */
export function validateVitalsInput(v: VitalsInput): string | null {
  const present = VITAL_KEYS.filter((k) => v[k] != null);
  if (!present.length) return "at least one vital sign is required";
  for (const k of present) {
    const n = v[k] as number;
    if (!Number.isFinite(n)) return `${k} must be a number`;
    const [lo, hi] = HARD_LIMITS[k];
    if (n < lo || n > hi) return `${k} is outside the possible range ${lo}..${hi}`;
  }
  if (v.systolic != null && v.diastolic != null && v.diastolic >= v.systolic) return "diastolic must be lower than systolic";
  return null;
}

export function flagVital(key: VitalKey, value: number, t: VitalsThresholds = BASELINE_VITALS_THRESHOLDS): VitalFlag | null {
  const r = t.ranges[key];
  if (r.criticalLow != null && value < r.criticalLow) return "CRITICAL_LOW";
  if (r.criticalHigh != null && value > r.criticalHigh) return "CRITICAL_HIGH";
  if (r.low != null && value < r.low) return "LOW";
  if (r.high != null && value > r.high) return "HIGH";
  return null;
}

export function evaluateVitals(v: VitalsInput, t: VitalsThresholds = BASELINE_VITALS_THRESHOLDS) {
  const flags: Partial<Record<VitalKey, VitalFlag>> = {};
  for (const k of VITAL_KEYS) {
    const n = v[k];
    if (n == null) continue;
    const f = flagVital(k, n, t);
    if (f) flags[k] = f;
  }
  const critical = Object.values(flags).some((f) => f === "CRITICAL_LOW" || f === "CRITICAL_HIGH");
  return {
    flags,
    critical,
    /** KNESC01 — guidance, never an AI recommendation: a fixed reminder to escalate. */
    escalation: critical ? ({ required: true, guidanceEn: "Critical value: call the doctor now. If the patient is unstable call 123 (ambulance).", guidanceAr: "قيمة حرجة: اتصل بالطبيب الآن. إذا كان المريض غير مستقر اتصل بـ 123 (الإسعاف).", numbers: { ambulance: "123", police: "122" } } as const) : null,
  };
}

export const ESCALATION_ACTIONS = ["CALLED_DOCTOR", "CALLED_123", "MONITORING", "OTHER"] as const;
export type EscalationAction = (typeof ESCALATION_ACTIONS)[number];
