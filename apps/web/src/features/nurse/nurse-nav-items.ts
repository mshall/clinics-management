import { CalendarClock, ClipboardList, FileBarChart, Inbox, MapPinned, Pill, ShieldAlert, Tag, Users2, HeartHandshake, Rocket, FlaskConical } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Kiorly Nurse edition navigation (KX-23 §03): field-first order. Safety is always one tap away. */
export const NURSE_NAV_ITEMS: NurseNavItem[] = [
  { to: "/home-visits/today", labelKey: "nurse.nav.today", icon: MapPinned },
  { to: "/nurse/care-plans", labelKey: "nurse.nav.carePlans", icon: ClipboardList },
  { to: "/nurse/inbox", labelKey: "nurse.nav.inbox", icon: Inbox },
  { to: "/nurse/mar", labelKey: "nurse.nav.mar", icon: Pill },
  { to: "/nurse/lab", labelKey: "nurse.nav.lab", icon: FlaskConical },
  { to: "/nurse/dispatch", labelKey: "nurse.nav.dispatch", icon: Users2, agencyOnly: true },
  { to: "/nurse/shifts", labelKey: "nurse.nav.shifts", icon: CalendarClock },
  { to: "/nurse/services", labelKey: "nurse.nav.services", icon: Tag },
  { to: "/nurse/family", labelKey: "nurse.nav.family", icon: HeartHandshake },
  { to: "/nurse/reports", labelKey: "nurse.nav.reports", icon: FileBarChart },
  { to: "/nurse/safety", labelKey: "nurse.nav.safety", icon: ShieldAlert },
  { to: "/nurse/onboarding", labelKey: "nurse.nav.onboarding", icon: Rocket },
];

export type NurseNavItem = { to: string; labelKey: string; icon: LucideIcon; agencyOnly?: boolean; end?: boolean };
