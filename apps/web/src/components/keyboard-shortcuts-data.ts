
/** Go-to sequences: press `g`, then the letter within 1.2 s. */
export const GO_TO: Array<{ key: string; path: string; labelKey: string; fallback: string }> = [
  { key: "d", path: "/", labelKey: "nav.dashboard", fallback: "Dashboard" },
  { key: "p", path: "/patients", labelKey: "nav.patients", fallback: "Patients" },
  { key: "a", path: "/appointments", labelKey: "nav.appointments", fallback: "Appointments" },
  { key: "b", path: "/front-desk/board", labelKey: "nav.frontDeskBoard", fallback: "Front desk board" },
  { key: "e", path: "/encounters", labelKey: "nav.encounters", fallback: "Encounters" },
  { key: "r", path: "/revenue", labelKey: "nav.revenue", fallback: "Revenue" },
  { key: "k", path: "/kiorex", labelKey: "nav.kiorex", fallback: "Kiorex" },
];
