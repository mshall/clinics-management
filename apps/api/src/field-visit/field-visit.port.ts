import type {
  Address,
  BookingCheck,
  BookingOptions,
  CoverageResult,
  CoverageZone,
  DeliveryResult,
  FieldVisit,
  PlannedVisit,
  SafetyAlert,
  SafetyEvaluation,
  SafetyState,
  TransitionResult,
  TravelMatrix,
  Viewer,
  VisitEvent,
} from "@kiorly/field-visit";

/**
 * Interface between Kiorly Clinic and the shared `@kiorly/field-visit` package (KCV206, ADR-030).
 * Home-visit features (HVCFG/HVBK/HVEXE/HVSAF…) depend on THIS port, never on the package directly, so the package can be
 * swapped for its published version, or the implementation replaced in tests.
 *
 * Safety methods (address visibility, safety timer, SOS, alert delivery) are ADR-025 safety controls: implementations must
 * never read feature flags. `ff-safety-never-flags.node.test.ts` enforces it for this folder.
 */
export interface FieldVisitPort {
  checkCoverage(zone: CoverageZone, address: Address | null | undefined, matrix?: TravelMatrix): CoverageResult;
  canBookHomeSlot(candidate: PlannedVisit, existing: readonly PlannedVisit[], opts?: BookingOptions): BookingCheck;
  applyVisitEvent(visit: FieldVisit, event: VisitEvent, nowMs: number): TransitionResult;
  canViewAddress(viewer: Viewer, visit: Pick<FieldVisit, "state" | "assignedClinicianId" | "endedAtMs">, nowMs: number): boolean;
  evaluateSafetyTimer(visit: Pick<FieldVisit, "id" | "state" | "plannedEndMs">, state: SafetyState, nowMs: number): SafetyEvaluation;
  /** Builds and delivers a safety alert (timer expiry or SOS) through the organisation's channels; never throws. */
  deliverSafetyAlert(alert: SafetyAlert, dueAtMs: number, to?: { tenantId: string | null; contactAddress: string }): Promise<DeliveryResult>;
}

export const FIELD_VISIT_PORT = Symbol("FIELD_VISIT_PORT");
