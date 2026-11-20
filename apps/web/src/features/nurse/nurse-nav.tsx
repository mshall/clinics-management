import { CalendarClock, ClipboardList, FileBarChart, Inbox, MapPinned, Pill, ShieldAlert, Tag, Users2, HeartHandshake, Rocket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

export type NurseNavItem = { to: string; labelKey: string; icon: LucideIcon; agencyOnly?: boolean; end?: boolean };

/** Kiorly Nurse edition navigation (KX-23 §03): field-first order. Safety is always one tap away. */
export const NURSE_NAV_ITEMS: NurseNavItem[] = [
  { to: "/home-visits/today", labelKey: "nurse.nav.today", icon: MapPinned },
  { to: "/nurse/care-plans", labelKey: "nurse.nav.carePlans", icon: ClipboardList },
  { to: "/nurse/inbox", labelKey: "nurse.nav.inbox", icon: Inbox },
  { to: "/nurse/mar", labelKey: "nurse.nav.mar", icon: Pill },
  { to: "/nurse/dispatch", labelKey: "nurse.nav.dispatch", icon: Users2, agencyOnly: true },
  { to: "/nurse/shifts", labelKey: "nurse.nav.shifts", icon: CalendarClock },
  { to: "/nurse/services", labelKey: "nurse.nav.services", icon: Tag },
  { to: "/nurse/family", labelKey: "nurse.nav.family", icon: HeartHandshake },
  { to: "/nurse/reports", labelKey: "nurse.nav.reports", icon: FileBarChart },
  { to: "/nurse/safety", labelKey: "nurse.nav.safety", icon: ShieldAlert },
  { to: "/nurse/onboarding", labelKey: "nurse.nav.onboarding", icon: Rocket },
];

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

