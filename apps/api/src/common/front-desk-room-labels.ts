export const DEFAULT_FRONT_DESK_ROOM_LABELS = ["Room 1", "Room 2", "Room 3"] as const;

const ROOM_LABEL_MAX_LEN = 80;
const ROOM_LABEL_MAX_COUNT = 50;

/** Parse stored JSON into display labels (falls back to defaults). */
export function parseFrontDeskRoomLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_FRONT_DESK_ROOM_LABELS];
  const strings = value.filter((x): x is string => typeof x === "string");
  const normalized = normalizeFrontDeskRoomLabels(strings);
  return normalized.length ? normalized : [...DEFAULT_FRONT_DESK_ROOM_LABELS];
}

/** Trim, dedupe (case-insensitive), enforce limits; throws on invalid input. */
export function normalizeFrontDeskRoomLabels(labels: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of labels) {
    const name = raw.trim();
    if (!name) continue;
    const clipped = name.length > ROOM_LABEL_MAX_LEN ? name.slice(0, ROOM_LABEL_MAX_LEN) : name;
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= ROOM_LABEL_MAX_COUNT) break;
  }
  if (!out.length) {
    throw new Error("At least one room name is required");
  }
  return out;
}
