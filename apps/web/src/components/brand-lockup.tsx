import { useEffect, useState } from "react";
import { KiorlyBrandLockup } from "@/brand/ui-kit";

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

/** "Kiorly Clinic by Kiorex" lockup (or Kiorly Nurse) with the localised product tagline beneath it (shared KiorlyBrandLockup). */
export function BrandLockup({ height = 44, tagline = true }: { height?: number; tagline?: boolean }) {
  const nurse = useNurseEditionDom();
  return <KiorlyBrandLockup nurse={nurse} height={height} tagline={tagline} />;
}
