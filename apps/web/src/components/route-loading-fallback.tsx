import { useTranslation } from "react-i18next";
import { Pulse } from "@/brand/ui-kit";

/** Shown while a lazy route chunk loads (mobile/AWS: smaller initial JS). */
export function RouteLoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
      <Pulse size={22} loop />
      <span role="status">{t("common.loading")}</span>
    </div>
  );
}