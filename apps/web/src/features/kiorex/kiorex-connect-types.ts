export type ConnectStepStatus = "done" | "action_needed" | "waiting_kiorex" | "blocked";
export interface ConnectStepDto { key: string; status: ConnectStepStatus; optional?: boolean; link?: string; detail?: Record<string, unknown> }
export interface ConnectDoctorDto { listingId: string; clinicianId: string; name: string; verification: string; hasAvailability: boolean; profilePercent: number; profileMissing: string[]; status: "DRAFT" | "PENDING_VERIFICATION" | "LIVE" | "PAUSED"; pausedReason: string | null; ready: boolean }
export interface KiorexFeeRow { specialty: string | null; feeType: "FLAT" | "PERCENT"; amount: string | null; percent: string | null }
export interface ConnectDto {
  clinicId: string; tenantId: string; legacy: boolean; status: string; edition: "CLINIC" | "NURSE"; market: string; progress: number; canRequest: boolean;
  steps: ConnectStepDto[]; doctors: ConnectDoctorDto[]; kiorex: { status: string; reason?: string | null; at: string } | null; requestId: string | null;
  consent: { at: string; termsVersion: string; feeAcknowledged: boolean } | null; termsVersion: string;
  feeCard: { currency?: string; rates?: KiorexFeeRow[]; defaultRate?: KiorexFeeRow | null; items?: KiorexFeeRow[] } | null;
}
