import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KiorlyBrand } from "@/brand/ui-kit";

/** Reactive: true while the Nurse edition is applied (`html[data-edition="nurse"]`, set by EditionBoot). */
export function useNurseEditionDom(): boolean {
  const read = () => typeof document !== "undefined" && document.documentElement.dataset.edition === "nurse";
  const [nurse, setNurse] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setNurse(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-edition"] });
    setNurse(read());
    return () => mo.disconnect();
  }, []);
  return nurse;
}

/** "Kiorly Clinic by Kiorex" lockup (or Kiorly Nurse) with the localised product tagline beneath. */
export function BrandLockup({ height = 44, tagline = true }: { height?: number; tagline?: boolean }) {
  const { t } = useTranslation();
  const nurse = useNurseEditionDom();
  return (
    <div className="min-w-0">
      <KiorlyBrand nurse={nurse} height={height} />
      {tagline ? <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">{t("app.tagline")}</p> : null}
    </div>
  );
}
