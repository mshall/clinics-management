import { Injectable } from "@nestjs/common";
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

@Injectable()
export class FieldVisitService implements FieldVisitPort {
  /** Safety contact address per tenant is resolved by the caller (home-visit feature); the port takes the dispatchers' view. */
  constructor(private readonly dispatchers: SafetyAlertDispatcher[] = FieldVisitService.defaultDispatchers()) {}

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

  deliverSafetyAlert(alert: SafetyAlert, dueAtMs: number): Promise<DeliveryResult> {
    return deliverSafetyAlert(alert, this.dispatchers, dueAtMs, Date.now);
  }
}
