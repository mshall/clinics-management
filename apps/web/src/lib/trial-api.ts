import { apiGet } from "@/lib/http";

export type TrialStatus = {
  endsAt: string | null;
  daysLeft: number | null;
  activated: boolean;
  activationProgress: { current: number; required: number };
  status: string;
  commissionPolicy: string;
};

export function fetchTrialStatus(): Promise<TrialStatus> {
  return apiGet<TrialStatus>("/api/v1/billing/trial");
}