import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { fetchTrialStatus, type TrialStatus } from "@/lib/trial-api";
import { useAuthStore } from "@/stores/auth-store";

export function TrialBanner() {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.accessToken);
  const [trial, setTrial] = useState<TrialStatus | null>(null);

  useEffect(() => {
    if (!token) {
      setTrial(null);
      return;
    }
    void fetchTrialStatus()
      .then(setTrial)
      .catch(() => setTrial(null));
  }, [token]);

  if (!trial || trial.status !== "TRIALING" || trial.daysLeft == null) return null;

  const { current, required } = trial.activationProgress;
  const progressLabel =
    trial.activated || current >= required
      ? t("trial.banner.activated")
      : t("trial.banner.activationProgress", {
          current,
          required,
        });

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-kx-ocean-600/40 bg-kx-ocean-600/10 px-4 py-2 text-sm"
    >
      <span>
        {t("trial.banner.daysLeft", { count: trial.daysLeft })} · {progressLabel}
      </span>
      <Link to="/admin" className="text-xs font-medium underline">
        {t("trial.banner.manageBilling")}
      </Link>
    </div>
  );
}