import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  applyEvent,
  canBook,
  canViewAddress,
  deliverSafetyAlert,
  evaluateSafety,
  isInCoverage,
  parseDistrictList,
  type Address,
  type BookingCheck,
  type BookingOptions,
  type CoverageResult,
  type CoverageZone,
  type DeliveryResult,
  type District,
  type FieldVisit,
  type PlannedVisit,
  type SafetyAlert,
  type SafetyAlertDispatcher,
  type SafetyEvaluation,
  type SafetyState,
  type TransitionResult,
  type TravelMatrix,
  type Viewer,
  type VisitEvent,
} from "@kiorly/field-visit";
import { isMock } from "../common/provider-mode";
import type { FieldVisitPort } from "./field-visit.port";
import { MockSafetyAlertDispatcher, UnwiredRealSafetyAlertDispatcher } from "./mock-safety-alert.dispatcher";

/** District list from the market pack (`Market.clinicalConfig.districts`); empty when the market has none yet. */
export function districtsFromMarket(market: { clinicalConfig?: unknown } | null | undefined): District[] {
  const cfg = market?.clinicalConfig;
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return [];
  const raw = (cfg as Record<string, unknown>).districts;
  return raw == null ? [] : parseDistrictList(raw);
}

/** Optional override of the default (mock/real by MODE) dispatchers; unbound in production wiring, used by tests. */
export const FIELD_VISIT_DISPATCHERS = Symbol("FIELD_VISIT_DISPATCHERS");

@Injectable()
export class FieldVisitService implements FieldVisitPort {
  private readonly dispatchers: SafetyAlertDispatcher[];

  /** Per-tenant dispatchers (organisation safety contact) are built per alert via `deliverSafetyAlert(..., to)`; these are the fallback. */
  constructor(@Optional() @Inject(FIELD_VISIT_DISPATCHERS) dispatchers?: SafetyAlertDispatcher[]) {
    this.dispatchers = dispatchers ?? FieldVisitService.defaultDispatchers();
  }

  static defaultDispatchers(tenantId: string | null = null, contactAddress = "safety-contact"): SafetyAlertDispatcher[] {
    return [isMock("sms") ? new MockSafetyAlertDispatcher(tenantId, contactAddress) : new UnwiredRealSafetyAlertDispatcher()];
  }

  checkCoverage(zone: CoverageZone, address: Address | null | undefined, matrix?: TravelMatrix): CoverageResult {
    return isInCoverage(zone, address, matrix);
  }

  canBookHomeSlot(candidate: PlannedVisit, existing: readonly PlannedVisit[], opts?: BookingOptions): BookingCheck {
    return canBook(candidate, existing, opts);
  }

  applyVisitEvent(visit: FieldVisit, event: VisitEvent, nowMs: number): TransitionResult {
    return applyEvent(visit, event, nowMs);
  }

  canViewAddress(viewer: Viewer, visit: Pick<FieldVisit, "state" | "assignedClinicianId" | "endedAtMs">, nowMs: number): boolean {
    return canViewAddress(viewer, visit, nowMs);
  }

  evaluateSafetyTimer(visit: Pick<FieldVisit, "id" | "state" | "plannedEndMs">, state: SafetyState, nowMs: number): SafetyEvaluation {
    return evaluateSafety(visit, state, nowMs);
  }

  deliverSafetyAlert(alert: SafetyAlert, dueAtMs: number, to?: { tenantId: string | null; contactAddress: string }): Promise<DeliveryResult> {
    const dispatchers = to ? FieldVisitService.defaultDispatchers(to.tenantId, to.contactAddress) : this.dispatchers;
    return deliverSafetyAlert(alert, dispatchers, dueAtMs, Date.now);
  }
}
