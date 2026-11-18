export const SLOT_CHANNEL = {
  INTERNAL: "INTERNAL",
  MARKETPLACE: "MARKETPLACE",
} as const;

export type SlotChannel = (typeof SLOT_CHANNEL)[keyof typeof SLOT_CHANNEL];

export const SLOTS_CHANGED_TOPIC = "SLOTS_CHANGED";