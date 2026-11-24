/**
 * GRW-P2-W usage bundle skeleton (flag `clinic.usage_bundles`, OFF by default). Prices are placeholders: real prepaid-pack pricing needs KX-12 and
 * decision H-2 (NEEDS_HUMAN), and VAT treatment of credit purchases needs H-25. Units are never currency.
 */
export const USAGE_UNITS = ["SMS", "WHATSAPP", "STORAGE_GB"] as const;
export type UsageUnit = (typeof USAGE_UNITS)[number];

export type UsageBundle = { key: string; unit: UsageUnit; units: number; priceCredit: number; labelEn: string; labelAr: string };

export const USAGE_BUNDLES: readonly UsageBundle[] = [
  { key: "sms-500", unit: "SMS", units: 500, priceCredit: 0, labelEn: "500 SMS", labelAr: "٥٠٠ رسالة نصية" },
  { key: "whatsapp-500", unit: "WHATSAPP", units: 500, priceCredit: 0, labelEn: "500 WhatsApp messages", labelAr: "٥٠٠ رسالة واتساب" },
  { key: "storage-10", unit: "STORAGE_GB", units: 10, priceCredit: 0, labelEn: "10 GB extra storage", labelAr: "١٠ جيجابايت تخزين إضافي" },
] as const;

export const bundleByKey = (key: string) => USAGE_BUNDLES.find((b) => b.key === key);
