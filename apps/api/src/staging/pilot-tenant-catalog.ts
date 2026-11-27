import { pilotEmailDomain } from "./pilot-email-domain";
import { PlanKey } from "@prisma/client";

export type PilotTier = "lite" | "pro" | "clinic";

export type PilotTenantSpec = {
  tier: PilotTier;
  nameEn: string;
  nameAr: string;
  adminEmail: string;
  licenseNumber: string;
  planKey: PlanKey;
  clinicianSeats: number;
  whatsAppReminders: boolean;
};

export const PILOT_TENANT_SPECS: Record<PilotTier, PilotTenantSpec> = {
  lite: {
    tier: "lite",
    nameEn: "Sales pilot — Lite",
    nameAr: "تجريبي مبيعات — لايت",
    adminEmail: `sales-lite@${pilotEmailDomain()}`,
    licenseNumber: "PILOT-SALES-LITE",
    planKey: PlanKey.LITE,
    clinicianSeats: 2,
    whatsAppReminders: false,
  },
  pro: {
    tier: "pro",
    nameEn: "Sales pilot — Pro",
    nameAr: "تجريبي مبيعات — برو",
    adminEmail: `sales-pro@${pilotEmailDomain()}`,
    licenseNumber: "PILOT-SALES-PRO",
    planKey: PlanKey.PRO,
    clinicianSeats: 5,
    whatsAppReminders: true,
  },
  clinic: {
    tier: "clinic",
    nameEn: "Sales pilot — Clinic",
    nameAr: "تجريبي مبيعات — عيادة",
    adminEmail: `sales-clinic@${pilotEmailDomain()}`,
    licenseNumber: "PILOT-SALES-CLINIC",
    planKey: PlanKey.CLINIC,
    clinicianSeats: 5,
    whatsAppReminders: true,
  },
};

export const PILOT_TIERS = Object.keys(PILOT_TENANT_SPECS) as PilotTier[];

export function parsePilotTierArg(raw: string | undefined): PilotTier | "all" | null {
  const v = raw?.trim().toLowerCase();
  if (!v || v === "all") return "all";
  if (v === "lite" || v === "pro" || v === "clinic") return v;
  return null;
}

/** Demo patients recreated after every sales reset. */
export const PILOT_DEMO_PATIENTS = [
  { mrn: "PILOT-001", firstNameEn: "Sara", lastNameEn: "Hassan", phone: "+201001112233" },
  { mrn: "PILOT-002", firstNameEn: "Omar", lastNameEn: "Khaled", phone: "+201002223344" },
  { mrn: "PILOT-003", firstNameEn: "Nadia", lastNameEn: "Adel", phone: "+201003334455" },
] as const;