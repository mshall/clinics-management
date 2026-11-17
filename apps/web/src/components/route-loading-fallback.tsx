import { useTranslation } from "react-i18next";

/** Shown while a lazy route chunk loads (mobile/AWS: smaller initial JS). */
export function RouteLoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden
      />
      {t("common.loading")}
    </div>
  );
}