import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { isFlagOn, useEffectiveFlags } from "@/features/flags/use-effective-flags";
import { PAY_FLAG } from "./pay-api";
import "./pay-i18n";

/** Entry point to the Pay collections screens; renders nothing while `clinic.pay_collections` is off (the default). */
export function PayEntryLink() {
  const { t } = useTranslation();
  const { data } = useEffectiveFlags();
  const f = data?.flags.find((x) => x.key === PAY_FLAG);
  if (!f || !isFlagOn(data, PAY_FLAG)) return null;
  return <Link to="/pay" className="text-sm font-medium text-primary underline-offset-4 hover:underline" data-testid="pay-entry-link">{t("pay.title")}</Link>;
}
