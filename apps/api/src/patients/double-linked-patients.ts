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

/** Placeholder / junk phones must not create false duplicate clusters (000…, 111…). */
export function isPlaceholderPatientPhone(phone: string): boolean {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 8) return true;
  if (/^0+$/.test(digits) || /^1+$/.test(digits) || /^9+$/.test(digits)) return true;
  const zeroRatio = (digits.match(/0/g) ?? []).length / digits.length;
  if (zeroRatio >= 0.85) return true;
  const oneRatio = (digits.match(/1/g) ?? []).length / digits.length;
  if (oneRatio >= 0.85) return true;
  return false;
}

function phoneClusterKey(phone: string): string | null {
  if (isPlaceholderPatientPhone(phone)) return null;
  const e164 = normalizePhoneToE164(phone);
  if (e164) return e164;
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 8) return null;
  return `digits:${digits.slice(-9)}`;
}

function phonesLikelySame(a: string, b: string): boolean {
  const ka = phoneClusterKey(a);
  const kb = phoneClusterKey(b);
  if (ka && kb && ka === kb) return true;
  if (isPlaceholderPatientPhone(a) || isPlaceholderPatientPhone(b)) return false;
  return phonesMatch(a, b);
}

function normalizePersonToken(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u064B-\u065F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensLikelyEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Transliteration stubs: Badry/Badr, Elsayed/Elsaid, Mohammed/Mohamed
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;
  const stripVowels = (s: string) => s.replace(/[aeiouyاويىة]/g, "");
  const sa = stripVowels(a);
  const sb = stripVowels(b);
  if (sa.length >= 3 && sb.length >= 3 && (sa === sb || sa.startsWith(sb) || sb.startsWith(sa))) return true;
  return false;
}

/** Loose name similarity so phone clusters of different people are not auto-merged. */
export function patientNamesLikelySame(a: DoubleLinkedPatientRow, b: DoubleLinkedPatientRow): boolean {
  const aEn = normalizePersonToken(`${a.firstNameEn} ${a.lastNameEn}`);
  const bEn = normalizePersonToken(`${b.firstNameEn} ${b.lastNameEn}`);
  if (aEn && bEn && (aEn === bEn || (aEn.length >= 8 && (aEn.includes(bEn) || bEn.includes(aEn))))) return true;
  const aAr = normalizePersonToken(`${a.firstNameAr ?? ""} ${a.lastNameAr ?? ""}`);
  const bAr = normalizePersonToken(`${b.firstNameAr ?? ""} ${b.lastNameAr ?? ""}`);
  if (aAr.length >= 4 && bAr.length >= 4 && (aAr === bAr || aAr.includes(bAr) || bAr.includes(aAr))) return true;

  const aParts = aEn.split(" ").filter((t) => t.length > 2);
  const bParts = bEn.split(" ").filter((t) => t.length > 2);
  if (aParts.length < 2 || bParts.length < 2) return false;
  // Require first+last family agreement — a lone shared "Mohammed"/"Ahmed" is not enough.
  const firstOk = tokensLikelyEqual(aParts[0]!, bParts[0]!);
  const lastA = aParts[aParts.length - 1]!;
  const lastB = bParts[bParts.length - 1]!;
  const lastOk = tokensLikelyEqual(lastA, lastB);
  if (firstOk && lastOk) return true;
  let overlap = 0;
  for (const t of aParts) {
    if (bParts.some((u) => tokensLikelyEqual(t, u))) overlap += 1;
  }
  return overlap >= 2;
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

  // Phone match via E.164 (or last-9 digit fallback) — skip placeholder phones
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

/**
 * Whether a duplicate cluster is safe to auto-merge (same person).
 * Phone clusters require likely-same names; placeholder-phone clusters never auto-merge.
 */
export function isSafeAutoMergeCluster(cluster: DoubleLinkedCluster): boolean {
  if (cluster.patients.length < 2) return false;
  if (cluster.reason === "nationalId") return true;
  if (cluster.reason === "name_dob") {
    // Per-clinic AES seed rows share name+DOB by design — do not collapse them.
    if (cluster.patients.every((p) => p.mrn.startsWith("AES-"))) return false;
    return true;
  }
  if (cluster.reason === "phone") {
    if (cluster.patients.some((p) => isPlaceholderPatientPhone(p.phone))) return false;
    const seed = cluster.patients[0]!;
    return cluster.patients.every((p) => patientNamesLikelySame(seed, p));
  }
  return false;
}
