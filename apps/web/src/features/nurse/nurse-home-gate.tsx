import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { RouteLoadingFallback } from "@/components/route-loading-fallback";
import { useAuthStore } from "@/stores/auth-store";
import { useNurseContext } from "./nurse-shared-utils";

/** Nurse edition landing: field nurses open on the Today route, agency office staff on dispatch. Clinic edition (and a failed context call) keeps the normal dashboard. */
export function NurseHomeGate({ children }: { children: ReactNode }) {
  const ctx = useNurseContext();
  const role = useAuthStore((s) => s.user?.role);
  if (ctx.isLoading) return <RouteLoadingFallback />;
  if (ctx.data?.edition === "NURSE") {
    const office = ctx.data.kind === "AGENCY" && role !== "physician";
    return <Navigate to={office ? "/nurse/dispatch" : "/home-visits/today"} replace />;
  }
  return <>{children}</>;
}
