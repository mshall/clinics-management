import { parseFrontDeskRoomLabels } from "../common/front-desk-room-labels";

/** Pick an exam room label for a visit (labels must match clinic Settings → Exam rooms). */
export function resolveExamRoomLabel(input: {
  roomLabels: string[];
  occupiedLabels: ReadonlySet<string>;
  preferred?: string | null;
  clinicianDefault?: string | null;
}): string | null {
  const configured = parseFrontDeskRoomLabels(input.roomLabels);
  if (!configured.length) return null;

  const tryLabel = (label: string | null | undefined): string | null => {
    const t = label?.trim();
    if (!t) return null;
    const exact = configured.find((r) => r === t);
    if (exact && !input.occupiedLabels.has(exact)) return exact;
    return null;
  };

  const fromPreferred = tryLabel(input.preferred);
  if (fromPreferred) return fromPreferred;

  const fromClinician = tryLabel(input.clinicianDefault);
  if (fromClinician) return fromClinician;

  const free = configured.find((r) => !input.occupiedLabels.has(r));
  return free ?? null;
}