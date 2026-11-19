import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isFlagOn, useEffectiveFlags } from "./use-effective-flags";

/**
 * FF04 — render children only when the flag is effective. `unavailableNote` shows the AR/EN
 * "temporarily unavailable" copy instead of silently hiding (OFF never hides existing data — use only for new-action UI).
 */
export function Feature({
  flag,
  children,
  fallback = null,
  unavailableNote = false,
}: {
  flag: string;
  children: ReactNode;
  fallback?: ReactNode;
  unavailableNote?: boolean;
}) {
  const { t } = useTranslation();
  const { data } = useEffectiveFlags();
  if (isFlagOn(data, flag)) return <>{children}</>;
  if (unavailableNote) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`feature-disabled-${flag}`}>
        {t("flags.temporarilyUnavailable")}
      </p>
    );
  }
  return <>{fallback}</>;
}
