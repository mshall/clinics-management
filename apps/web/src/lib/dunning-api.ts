import { apiGet } from "@/lib/http";

export type SubscriptionAccessState = {
  status: string;
  phase: string;
  marketplacePaused: boolean;
  allowedActions: string[];
  isOwner: boolean;
  daysOverdue: number;
  banner: string | null;
};

export async function fetchSubscriptionAccessState(): Promise<SubscriptionAccessState> {
  return apiGet<SubscriptionAccessState>("/billing/access-state");
}