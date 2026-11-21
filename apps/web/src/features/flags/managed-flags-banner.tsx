import { useTranslation } from "react-i18next";
import { useFlagStatus } from "@/features/flags/use-flag-status";

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
