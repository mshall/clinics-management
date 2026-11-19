/**
 * ADR-025 — safety controls are NEVER feature flags (KX-08 §09 "Not flags — never switchable").
 *
 * `paths` lists the code that implements each control. `ff-safety-never-flags.node.test.ts` fails CI when any
 * of those files references the flag machinery (`@RequiresFeature`, `FeatureFlagsService`, `FeatureGuard`,
 * `isEnabled`), and when a registered flag key contains a forbidden token.
 * Token lists mirror `kiorex-contracts/flags/safety-never-flags.json`.
 */
export type SafetyControl = {
  id: string;
  label: string;
  /** Files (relative to apps/api/src) or directories (trailing `/`) implementing the control. */
  paths: readonly string[];
  forbiddenKeyTokens: readonly string[];
};

export const SAFETY_CONTROLS: readonly SafetyControl[] = [
  {
    id: "rx_safety_checks",
    label: "Rx safety checks (interactions, allergies, duplicates)",
    paths: [
      "clinical/rx-safety-check.service.ts",
      "clinical/clinical-safety.service.ts",
      "clinical/rx-safety.types.ts",
      "clinical/rx-safety-severity.ts",
      "clinical/allergy-ingredient-map.ts",
      "common/patient-allergies.ts",
    ],
    forbiddenKeyTokens: ["rx_safety", "interaction", "allergy", "duplicate_check"],
  },
  {
    id: "encounter_signoff",
    label: "Encounter sign-off, auto-lock and versioned amendments",
    paths: ["common/encounter-lock.ts"],
    forbiddenKeyTokens: ["signoff", "sign_off", "auto_lock", "amendment"],
  },
  {
    id: "audit_logging",
    label: "Audit logging",
    paths: ["audit/audit.service.ts", "audit/audit.interceptor.ts", "audit/audit.module.ts"],
    forbiddenKeyTokens: ["audit"],
  },
  {
    id: "consent_enforcement",
    label: "Consent enforcement",
    paths: ["compliance/consent-policy.service.ts", "compliance/consent-policy.constants.ts"],
    forbiddenKeyTokens: ["consent_enforce", "consent_check"],
  },
  {
    id: "tenant_record_access",
    label: "Record view / print / export for the tenant",
    paths: ["exports/tenant-export.service.ts", "exports/exports.controller.ts", "clinical/rx-print.ts"],
    forbiddenKeyTokens: ["record_view", "record_print", "record_export", "tenant_export"],
  },
  {
    id: "privileged_mfa",
    label: "Privileged MFA on production",
    paths: [
      "auth/privileged-mfa.guard.ts",
      "auth/privileged-mfa.ts",
      "auth/privileged-mfa-enforcement.ts",
      "auth/privileged-mfa-policy.service.ts",
      "auth/mfa.service.ts",
    ],
    forbiddenKeyTokens: ["privileged_mfa", "mfa"],
  },
  {
    id: "tenant_isolation_authz",
    label: "Tenant isolation and authorization",
    paths: ["auth/require-tenant.ts", "auth/jwt-auth.guard.ts", "auth/jwt.strategy.ts", "common/effective-roles.ts"],
    forbiddenKeyTokens: ["tenant_isolation", "authorization", "authz"],
  },
  {
    id: "breach_response_tooling",
    label: "Breach-response tooling",
    paths: ["observability/notify-on-call.ts"],
    forbiddenKeyTokens: ["breach"],
  },
];

/** Tokens that must never appear inside a registered flag key. */
export const SAFETY_FORBIDDEN_KEY_TOKENS: readonly string[] = SAFETY_CONTROLS.flatMap((c) => c.forbiddenKeyTokens);

/** Source patterns that indicate flag gating. */
export const FLAG_GATING_PATTERNS: readonly RegExp[] = [
  /RequiresFeature\s*\(/,
  /FeatureGuard\b/,
  /FeatureFlagsService\b/,
  /\bisEnabledForUser\s*\(/,
  /\bisEnabled\s*\(/,
  /\brequireFeature\s*\(/,
];

export function flagKeyViolatesSafetyRule(key: string): string | null {
  const lower = key.toLowerCase();
  const hit = SAFETY_FORBIDDEN_KEY_TOKENS.find((t) => lower.includes(t));
  return hit ?? null;
}
