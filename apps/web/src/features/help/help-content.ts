import type { DemoRole } from "@/lib/roles";

export type TourGroup = "physician" | "frontDesk" | "admin";

export type TourStep = {
  /** i18n key under `help.tour.<group>.<id>` (title + body). */
  id: string;
  path?: string;
  /** Demo screenshot under `/tour/<group>-<id>.svg` unless overridden. */
  screenshot?: string;
  /** Last step offers the sample patient instead of a link. */
  samplePatient?: boolean;
};

export const TOUR_STEPS: Record<TourGroup, TourStep[]> = {
  physician: [
    { id: "welcome", screenshot: "/tour/physician-welcome.svg" },
    { id: "schedule", path: "/appointments", screenshot: "/tour/physician-schedule.svg" },
    { id: "chart", path: "/patients", screenshot: "/tour/physician-chart.svg" },
    { id: "visit", path: "/encounters", screenshot: "/tour/physician-visit.svg" },
    { id: "sample", samplePatient: true, screenshot: "/tour/physician-sample.svg" },
  ],
  frontDesk: [
    { id: "welcome", screenshot: "/tour/frontDesk-welcome.svg" },
    { id: "book", path: "/appointments", screenshot: "/tour/frontDesk-book.svg" },
    { id: "checkIn", path: "/front-desk/waiting-room", screenshot: "/tour/frontDesk-checkIn.svg" },
    { id: "payment", path: "/front-desk/board", screenshot: "/tour/frontDesk-payment.svg" },
    { id: "sample", samplePatient: true, screenshot: "/tour/frontDesk-sample.svg" },
  ],
  admin: [
    { id: "welcome", screenshot: "/tour/admin-welcome.svg" },
    { id: "checklist", path: "/onboarding", screenshot: "/tour/admin-checklist.svg" },
    { id: "team", path: "/team", screenshot: "/tour/admin-team.svg" },
    { id: "import", path: "/onboarding/import", screenshot: "/tour/admin-import.svg" },
    { id: "dashboard", path: "/", screenshot: "/tour/admin-dashboard.svg" },
    { id: "sample", samplePatient: true, screenshot: "/tour/admin-sample.svg" },
  ],
};

/** Roles without a clinic workspace get no first-run tour. */
export function tourGroupForRole(role: DemoRole | undefined): TourGroup | null {
  if (!role || role === "platform_super_admin" || role === "sales_rep") return null;
  if (role === "physician") return "physician";
  if (["receptionist", "clinic_assistant", "call_center", "nurse"].includes(role)) return "frontDesk";
  return "admin";
}

export function tourStorageKey(userId: string): string {
  return `kiorly.firstRunTour.v1.${userId}`;
}

/**
 * 60-second Arabic how-to clips. Hosted outside the app; set VITE_HELP_VIDEO_BASE_URL to enable
 * (files `<base>/<id>-ar.mp4`). Without it the drawer lists them as coming soon.
 */
export const HELP_VIDEOS = ["bookAppointment", "checkInAndPay", "writeVisit", "importPatients", "inviteTeam"] as const;

export function helpVideoUrl(id: string): string | null {
  const base = (import.meta.env.VITE_HELP_VIDEO_BASE_URL as string | undefined)?.trim();
  return base ? `${base.replace(/\/$/, "")}/${id}-ar.mp4` : null;
}
