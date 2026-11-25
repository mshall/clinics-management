import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStaffMatchHashes, staffPhoneMatchHash, staffPhoneMatchKey, StaffPhoneMatchService } from "./staff-phone-match.service";

// vectors copied from kiorex-contracts 1.13.0 fixtures/growth-v1.13/staff-phone-match-vectors.json
const V = {"note": "staffPhoneMatchHash vectors (contracts 1.13.0). Clinic and Kiorex keep their own copy and prove it against these.", "secret": "test-client-secret", "cases": [{"phone": "+201012345678", "hash": "T9e7BhRP1IaQR8d9lU2fETnWT1pB-2n5qEONQExcOQU"}, {"phone": "01012345678", "hash": "T9e7BhRP1IaQR8d9lU2fETnWT1pB-2n5qEONQExcOQU"}, {"phone": "0020 101 234 5678", "hash": "T9e7BhRP1IaQR8d9lU2fETnWT1pB-2n5qEONQExcOQU"}, {"phone": "+20 (10) 1234-5678", "hash": "T9e7BhRP1IaQR8d9lU2fETnWT1pB-2n5qEONQExcOQU"}, {"phone": "12345", "hash": "7CsPbi1_Ly0BYTzEvKDDVxAGf6oKTdDi8CFmLjK_M8Y"}]} as { secret: string; cases: { phone: string; hash: string }[] };

describe("staff phone match (RF_PROVIDER_COLLUSION, contracts 1.13.0)", () => {
  it("hash equals the contracts vectors for every phone spelling", () => {
    const key = staffPhoneMatchKey(V.secret);
    for (const c of V.cases) assert.equal(staffPhoneMatchHash(c.phone, key), c.hash, c.phone);
  });
  it("hash input is validated: 1 to 20 hashes of 43 base64url characters", () => {
    const h = V.cases[0]!.hash;
    assert.deepEqual(parseStaffMatchHashes(h), [h]);
    for (const bad of [undefined, "", "short", Array.from({ length: 21 }, (_, i) => String(i).padEnd(43, "a")).join(",")]) assert.throws(() => parseStaffMatchHashes(bad));
  });
  it("answers one boolean for staff of the whole organisation and false for an unknown clinic", async () => {
    const prisma: any = {
      clinic: { findUnique: async ({ where }: any) => (where.id === "c1" ? { tenantId: "t1" } : null) },
      employee: { findMany: async ({ where }: any) => { assert.equal(where.tenantId, "t1"); return [{ phone: "+20 100 000 0001" }, { phone: "01012345678" }]; } },
    };
    const svc = new StaffPhoneMatchService(prisma);
    const hit = V.cases[0]!.hash;
    assert.equal(await svc.matches("c1", [hit], V.secret), true);
    assert.equal(await svc.matches("c1", [V.cases[4]!.hash], V.secret), false);
    assert.equal(await svc.matches("nope", [hit], V.secret), false);
    assert.equal(await svc.matches("c1", [hit], "other-secret"), false);
  });
});
