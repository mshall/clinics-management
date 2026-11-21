import { KiorlyBrandLockup } from "@/brand/ui-kit";
import { useNurseEditionDom } from "@/lib/use-nurse-edition-dom";

/** "Kiorly Clinic by Kiorex" lockup (or Kiorly Nurse) with the localised product tagline beneath it (shared KiorlyBrandLockup). */
export function BrandLockup({ height = 44, tagline = true }: { height?: number; tagline?: boolean }) {
  const nurse = useNurseEditionDom();
  return <KiorlyBrandLockup nurse={nurse} height={height} tagline={tagline} />;
}
