import type { DemoRole } from "@/lib/roles";

export type TourGroup = "physician" | "frontDesk" | "admin";

export type TourStep = {
  /** i18n key under `help.tour.<group>.steps.<id>` (title + body). */
  id: string;
  path?: string;
  /** Last step offers the sample patient instead of a link. */
  samplePatient?: boolean;
};

export const TOUR_STEPS: Record<TourGroup, TourStep[]> = {
  physician: [
    { id: "welcome" },
    { id: "schedule", path: "/appointments" },
    { id: "chart", path: "/patients" },
    { id: "visit", path: "/encounters" },
    { id: "sample", samplePatient: true },
  ],
  frontDesk: [
    { id: "welcome" },
    { id: "book", path: "/appointments" },
    { id: "checkIn", path: "/front-desk/waiting-room" },
    { id: "payment", path: "/front-desk/board" },
    { id: "sample", samplePatient: true },
  ],
  admin: [
    { id: "welcome" },
    { id: "checklist", path: "/onboarding" },
    { id: "team", path: "/team" },
    { id: "import", path: "/onboarding/import" },
    { id: "sample", samplePatient: true },
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
