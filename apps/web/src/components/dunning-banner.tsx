import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { fetchSubscriptionAccessState, type SubscriptionAccessState } from "@/lib/dunning-api";
import { useAuthStore } from "@/stores/auth-store";

const ALERT_STATUSES = new Set(["PAST_DUE", "GRACE", "READ_ONLY", "SUSPENDED"]);

export function DunningBanner() {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.accessToken);
  const [state, setState] = useState<SubscriptionAccessState | null>(null);

  useEffect(() => {
    if (!token) {
      setState(null);
      return;
    }
    void fetchSubscriptionAccessState()
      .then(setState)
      .catch(() => setState(null));
  }, [token]);

  if (!state?.banner || !ALERT_STATUSES.has(state.status)) return null;

  const message = t(state.banner, state.banner);
  const isGrace = state.status === "GRACE" || state.status === "PAST_DUE";
  const tone = isGrace
    ? "border-amber-500/40 bg-amber-500/10"
    : state.status === "READ_ONLY"
      ? "border-orange-500/40 bg-orange-500/10"
      : "border-red-500/40 bg-red-500/10";

  return (
    <div role="alert" className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm ${tone}`}>
      <span>{message}</span>
      {state.isOwner && (state.status === "GRACE" || state.status === "PAST_DUE" || state.status === "READ_ONLY" || state.status === "SUSPENDED") ? (
        <Link to="/admin" className="text-xs font-medium underline">
          {t("dunning.payCta")}
        </Link>
      ) : null}
    </div>
  );
}