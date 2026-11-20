/**
 * Bounded contexts for the modular monolith.
 * Each top-level folder under `src/` belongs to exactly one context.
 * Cross-context imports must follow {@link isCrossContextImportAllowed}.
 */

export type BoundedContextId =
  | "kernel"
  | "organization"
  | "clinical"
  | "front-office"
  | "compliance-fiscal"
  | "insights"
  | "engagement"
  | "composition";

/** Folders that are not domain modules (composition root, scripts). */
export const COMPOSITION_FOLDERS = new Set(["platform", "main.ts"]);

export const TOP_LEVEL_FOLDER_TO_CONTEXT: Record<string, BoundedContextId> = {
  common: "kernel",
  prisma: "kernel",
  health: "kernel",
  auth: "kernel",
  audit: "kernel",
  storage: "kernel",
  "feature-flags": "kernel",
  "scope-of-practice": "kernel",
  staging: "kernel",
  observability: "kernel",
  signup: "kernel",
  onboarding: "kernel",
  "sales-reps": "kernel",
  legal: "kernel",

  clinics: "organization",
  users: "organization",
  admin: "organization",
  markets: "organization",
  plans: "organization",
  kiorex: "organization",
  marketplace: "organization",
  "clinician-verification": "organization",
  credits: "organization",
  "billing-platform": "organization",
  subscriptions: "organization",
  entitlements: "organization",
  cohorts: "organization",
  usage: "organization",
  growth: "organization",
  "user-nav-tabs": "organization",
  "user-clinic-privilege-grants": "organization",
  "user-money-visibility": "organization",

  patients: "clinical",
  appointments: "clinical",
  encounters: "clinical",
  clinical: "clinical",
  scheduling: "clinical",
  operations: "clinical",
  "field-visit": "clinical",
  "home-visits": "clinical",
  nurse: "clinical",

  "front-desk": "front-office",
  billing: "front-office",
  revenue: "front-office",
  "revenue-share": "front-office",
  invoices: "front-office",
  expenses: "front-office",
  payroll: "front-office",
  "payroll-expenses": "front-office",

  compliance: "compliance-fiscal",
  providers: "compliance-fiscal",
  integrations: "compliance-fiscal",
  exports: "compliance-fiscal",

  reports: "insights",
  dashboard: "insights",

  messaging: "engagement",
  "dev-inbox": "engagement",
  push: "engagement",
  assistant: "engagement",
  "clinic-ai": "engagement",
  support: "engagement",
  hr: "engagement",

  platform: "composition",
};

/** Directed edges: source context may import from target context (in addition to kernel). */
export const ALLOWED_CROSS_CONTEXT_IMPORTS: ReadonlySet<string> = new Set([
  "organization->compliance-fiscal",
  "organization->clinical",
  "organization->front-office",
  "clinical->front-office",
  "clinical->compliance-fiscal",
  "clinical->organization",
  "clinical->engagement",
  "front-office->compliance-fiscal",
  "front-office->organization",
  "front-office->clinical",
  "engagement->organization",
  "insights->organization",
  "insights->organization",
  "insights->clinical",
  "insights->front-office",
  "insights->compliance-fiscal",
  "engagement->organization",
  "engagement->clinical",
  "engagement->front-office",
  "engagement->compliance-fiscal",
  "engagement->insights",
  "compliance-fiscal->organization",
  "compliance-fiscal->clinical",
  "compliance-fiscal->engagement",
  "kernel->organization",
  "kernel->clinical",
  "kernel->compliance-fiscal",
  "kernel->front-office",
  "kernel->engagement",
  "organization->engagement",
  "organization->clinical",
  "composition->kernel",
  "composition->organization",
  "composition->clinical",
  "composition->front-office",
  "composition->compliance-fiscal",
  "composition->insights",
  "composition->engagement",
]);

export function contextForTopLevelFolder(folder: string): BoundedContextId | null {
  return TOP_LEVEL_FOLDER_TO_CONTEXT[folder] ?? null;
}

export function isCrossContextImportAllowed(from: BoundedContextId, to: BoundedContextId): boolean {
  if (from === to) return true;
  if (to === "kernel") return true;
  return ALLOWED_CROSS_CONTEXT_IMPORTS.has(`${from}->${to}`);
}