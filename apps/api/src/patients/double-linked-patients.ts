import { normalizePhoneToE164 } from "../common/phone-e164";
import { normalizePhoneDigits, phonesMatch } from "./patient-phone";

export type DoubleLinkedPatientRow = {
  id: string;
  mrn: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  phone: string;
  email: string | null;
  nationalId: string | null;
  dob: Date | null;
  gender: string;
  homeBranchId: string | null;
  createdAt: Date;
};

export type DoubleLinkedCluster = {
  reason: "phone" | "nationalId" | "name_dob";
  matchKey: string;
  patients: DoubleLinkedPatientRow[];
};

function nameKey(p: DoubleLinkedPatientRow): string {
  return `${p.firstNameEn.trim().toLowerCase()}|${p.lastNameEn.trim().toLowerCase()}`;
}

function dobKey(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function phoneClusterKey(phone: string): string | null {
  const e164 = normalizePhoneToE164(phone);
  if (e164) return e164;
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 7) return null;
  return `digits:${digits.slice(-9)}`;
}

function phonesLikelySame(a: string, b: string): boolean {
  const ka = phoneClusterKey(a);
  const kb = phoneClusterKey(b);
  if (ka && kb && ka === kb) return true;
  return phonesMatch(a, b);
}

/** Cluster active patients that look like the same person (phone, national ID, or name+DOB). */
export function clusterDoubleLinkedPatients(rows: DoubleLinkedPatientRow[]): DoubleLinkedCluster[] {
  const clusters: DoubleLinkedCluster[] = [];
  const claimed = new Set<string>();

  // National ID exact match
  const byNational = new Map<string, DoubleLinkedPatientRow[]>();
  for (const p of rows) {
    const nid = p.nationalId?.trim();
    if (!nid) continue;
    const list = byNational.get(nid) ?? [];
    list.push(p);
    byNational.set(nid, list);
  }
  for (const [nid, group] of byNational) {
    if (group.length < 2) continue;
    for (const p of group) claimed.add(p.id);
    clusters.push({ reason: "nationalId", matchKey: nid, patients: group });
  }

  // Phone match via E.164 (or last-9 digit fallback)
  const byPhone = new Map<string, DoubleLinkedPatientRow[]>();
  for (const p of rows) {
    if (claimed.has(p.id)) continue;
    const key = phoneClusterKey(p.phone);
    if (!key) continue;
    const list = byPhone.get(key) ?? [];
    list.push(p);
    byPhone.set(key, list);
  }
  for (const [key, group] of byPhone) {
    if (group.length < 2) continue;
    const seed = group[0]!;
    const family = group.filter((p) => phonesLikelySame(seed.phone, p.phone));
    if (family.length < 2) continue;
    for (const p of family) claimed.add(p.id);
    clusters.push({ reason: "phone", matchKey: key, patients: family });
  }

  // Same EN name + same DOB
  const byNameDob = new Map<string, DoubleLinkedPatientRow[]>();
  for (const p of rows) {
    if (claimed.has(p.id)) continue;
    const dob = dobKey(p.dob);
    if (!dob) continue;
    const key = `${nameKey(p)}|${dob}`;
    const list = byNameDob.get(key) ?? [];
    list.push(p);
    byNameDob.set(key, list);
  }
  for (const [key, group] of byNameDob) {
    if (group.length < 2) continue;
    for (const p of group) claimed.add(p.id);
    clusters.push({ reason: "name_dob", matchKey: key, patients: group });
  }

  return clusters.sort((a, b) => b.patients.length - a.patients.length || a.reason.localeCompare(b.reason));
}
