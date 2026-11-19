export type PrintedRxItem = {
  brand: string;
  ingredients: string[];
  strength: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  instructionsAr: string | null;
};

export type PrintedRxResponse = {
  encounterId: string;
  clinicNameEn: string;
  clinicNameAr: string | null;
  doctorName: string;
  patientName: string;
  signedAt: string;
  items: PrintedRxItem[];
  verifyUrl: string | null;
  expiresAt: string;
};

export function printedItemLabel(item: PrintedRxItem): string {
  const head = [item.brand, item.strength].filter(Boolean).join(" ");
  return item.ingredients.length ? `${head} (${item.ingredients.join(" + ")})` : head;
}
