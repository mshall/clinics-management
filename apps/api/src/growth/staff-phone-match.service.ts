import { BadRequestException, Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Referral fraud rule RF_PROVIDER_COLLUSION (Kiorex side of the rule is GRW-P2-B1, contracts 1.13.0 `staffPhoneMatchHash`).
 * Kiorex sends keyed hashes of a patient's phone numbers; the Clinic answers ONE boolean: does any of them belong to a staff member of the clinic's organisation?
 * Never a name, a phone, a count or which hash matched. Hash = base64url(HMAC-SHA256(key = HMAC-SHA256(clientSecret, "kx-staff-phone-match-v1"), last ten digits)).
 * The Clinic keeps its own copy of the function (its Docker build context cannot reach the contracts package) and proves it against the contracts vectors
 * (`staff-phone-match.node.test.ts`). Nothing here is stored or logged.
 */
export const STAFF_MATCH_MAX_HASHES = 20;
export const STAFF_MATCH_HASH = /^[A-Za-z0-9_-]{43}$/;

export function staffPhoneDigits(phone: string): string {
  const d = phone.replace(/\D+/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}
export function staffPhoneMatchKey(clientSecret: string): Buffer {
  return createHmac("sha256", clientSecret).update("kx-staff-phone-match-v1").digest();
}
export function staffPhoneMatchHash(phone: string, key: Buffer): string {
  return createHmac("sha256", key).update(staffPhoneDigits(phone)).digest("base64url");
}
/** Parses the `hashes` query value: comma separated, 1 to 20, every one 43 base64url characters. */
export function parseStaffMatchHashes(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) throw new BadRequestException({ code: "INVALID_HASHES", message: "hashes is required" });
  const list = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  if (!list.length || list.length > STAFF_MATCH_MAX_HASHES || !list.every((h) => STAFF_MATCH_HASH.test(h))) throw new BadRequestException({ code: "INVALID_HASHES", message: `1 to ${STAFF_MATCH_MAX_HASHES} base64url hashes of 43 characters` });
  return list;
}

@Injectable()
export class StaffPhoneMatchService {
  constructor(private readonly prisma: PrismaService) {}

  /** True when any staff phone of the organisation that owns `clinicId` hashes to one of `hashes`. An unknown clinic answers false (not 404: it must not reveal which clinics exist). */
  async matches(clinicId: string, hashes: readonly string[], clientSecret: string): Promise<boolean> {
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId }, select: { tenantId: true } });
    if (!clinic) return false;
    const key = staffPhoneMatchKey(clientSecret);
    const wanted = new Set(hashes);
    // the whole organisation: a sister branch's staff can collude as well as the booked clinic's own
    const staff = await this.prisma.employee.findMany({ where: { tenantId: clinic.tenantId, deletedAt: null }, select: { phone: true } });
    for (const s of staff) {
      if (s.phone && staffPhoneDigits(s.phone).length >= 7 && wanted.has(staffPhoneMatchHash(s.phone, key))) return true;
    }
    return false;
  }
}
