import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { NURSE_NAV_ITEMS } from "@/features/nurse/nurse-nav-items";

export function NurseNavLinks({ agency, navClass, onNavigate }: { agency: boolean; navClass: (s: { isActive: boolean }) => string; onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mb-1 flex flex-col gap-0.5 border-b border-border pb-2" data-testid="nurse-nav">
      <p className="px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("app.name")}</p>
      {NURSE_NAV_ITEMS.filter((i) => agency || !i.agencyOnly).map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className={navClass} onClick={() => onNavigate?.()}>
          <i.icon className="size-4 shrink-0" aria-hidden />
          {t(i.labelKey)}
        </NavLink>
      ))}
    </div>
  );
}

