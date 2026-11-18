import { create } from "zustand";
import type { PlanUpgradePayload } from "@/lib/plan-upgrade-payload";

type PaywallState = {
  open: boolean;
  payload: PlanUpgradePayload | null;
  source?: string;
  show: (payload: PlanUpgradePayload, source?: string) => void;
  hide: () => void;
};

export const useUpgradePaywallStore = create<PaywallState>((set) => ({
  open: false,
  payload: null,
  source: undefined,
  show: (payload, source) => set({ open: true, payload, source }),
  hide: () => set({ open: false, payload: null, source: undefined }),
}));