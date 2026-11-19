import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiGet } from "@/lib/http";

export type FlagStatus = {
  managed: boolean;
  snapshot: { ageSeconds: number | null; stale: boolean; version: number | null } | null;
};

export function useFlagStatus() {
  return useQuery({
    queryKey: ["platform", "feature-flags-status"],
    queryFn: () => apiGet<FlagStatus>("/api/v1/admin/platform/feature-flags-status"),
  });
}

/** FF05 — platform/market flag pages are read-only mirrors when Kiorex is the authority. */
export function ManagedFlagsBanner() {
  const { t } = useTranslation();
  const { data } = useFlagStatus();
  if (!data?.managed) return null;
  const age = data.snapshot?.ageSeconds;
  return (
    <div
      role="status"
      data-testid="flags-managed-banner"
      className="mb-3 rounded-md border border-border bg-muted px-3 py-2 text-sm"
    >
      <strong>{t("flags.managedBanner")}</strong>
      <span className="ms-2 text-muted-foreground">
        {data.snapshot?.version != null
          ? t("flags.snapshotInfo", { version: data.snapshot.version, age: age ?? "—" })
          : t("flags.noSnapshotYet")}
      </span>
      {data.snapshot?.stale ? (
        <span className="ms-2 font-medium text-destructive">{t("flags.snapshotStale")}</span>
      ) : null}
    </div>
  );
}
