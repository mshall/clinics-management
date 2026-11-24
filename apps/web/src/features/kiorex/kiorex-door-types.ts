export type FrontDoorState = "NOT_CONNECTED" | "IN_PROGRESS" | "WAITING" | "LIVE" | "ATTENTION";
export interface FrontDoorDto {
  clinicId: string; state: FrontDoorState; status: string; legacy: boolean; started: boolean; interestedAt: string | null; leadAt: string | null;
  recent: Array<{ id: string; startsAt: string; status: string; channel: "marketplace" | "whatsapp"; clinicianName: string }>;
}
