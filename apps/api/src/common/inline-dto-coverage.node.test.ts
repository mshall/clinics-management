import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { AuthRefreshBodyDto, AuthOtpVerifyBodyDto } from "../auth/auth.controller.dto";
import { BillingPreviewSeatsBodyDto, BillingRecordPaymentBodyDto } from "../billing/billing.controller.dto";
import { PatientMoneyCancelPackageBodyDto, PatientMoneyApproveRefundBodyDto } from "../billing/patient-money.controller.dto";
import { CreateSlotHoldBodyDto } from "../marketplace/slot-hold.dto";
import { AppValidationPipe, isLenient } from "./lenient-dto";

/** EDGE-49 residual risk 1: every controller parameter that carries a body or a query is a validated DTO class, not an inline type that class-validator ignores. */
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".controller.ts") ? [p] : []; });
const SRC = join(__dirname, "..");

describe("no inline-typed @Body()/@Query() parameters (ratchet)", () => {
  it("no controller declares a body or query as an inline object type", () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/@(Body|Query)\(\s*\)\s+\w+\??:\s*\{/g)) offenders.push(`${f.slice(SRC.length + 1)}:${text.slice(0, m.index).split("\n").length}`);
    }
    assert.deepEqual(offenders, [], "use a DTO class (class-validator decorators) instead of an inline type");
  });
});

const pipe = new AppValidationPipe();
const run = (metatype: new () => object, value: unknown, type: "body" | "query" = "body") => pipe.transform(value, { type, metatype });
const rejects = async (fn: () => Promise<unknown>) => assert.rejects(fn, BadRequestException);

describe("DTOs that replaced inline types validate the declared fields and keep the API tolerant", () => {
  it("they are @Lenient: undeclared fields are dropped, never a 400, never visible to the service", async () => {
    assert.equal(isLenient(AuthRefreshBodyDto), true);
    const out = await run(AuthRefreshBodyDto, { refreshToken: "t", clientExtra: 1, __proto__x: "y" }) as Record<string, unknown>;
    assert.deepEqual({ ...out }, { refreshToken: "t" });
  });

  it("auth: a missing or mistyped required field is a 400 before the service runs", async () => {
    await rejects(() => run(AuthRefreshBodyDto, {}));
    await rejects(() => run(AuthRefreshBodyDto, { refreshToken: 5 }));
    await rejects(() => run(AuthRefreshBodyDto, { refreshToken: ["a"] }));
    await rejects(() => run(AuthOtpVerifyBodyDto, { phone: "+201000000000" })); // code missing
    await run(AuthOtpVerifyBodyDto, { phone: "+201000000000", code: "123456" });
    await run(AuthOtpVerifyBodyDto, { phone: "+201000000000", code: "123456", mfaCode: null }); // optional fields may be null, like the untyped code accepted
  });

  it("money: enums, required reasons and numbers are enforced", async () => {
    await run(PatientMoneyCancelPackageBodyDto, { reason: "patient asked", method: "CASH" });
    await rejects(() => run(PatientMoneyCancelPackageBodyDto, { method: "CASH" })); // reason missing
    await rejects(() => run(PatientMoneyCancelPackageBodyDto, { reason: "x", method: "BITCOIN" }));
    await run(PatientMoneyApproveRefundBodyDto, {}); // note is optional
    await rejects(() => run(PatientMoneyApproveRefundBodyDto, { note: { a: 1 } }));
    await rejects(() => run(BillingPreviewSeatsBodyDto, { seats: "many" }));
    const seats = await run(BillingPreviewSeatsBodyDto, { seats: "5" }) as { seats: number };
    assert.equal(seats.seats, 5, "a numeric string from a form is coerced, as the service did with Number()");
    await rejects(() => run(BillingRecordPaymentBodyDto, { amount: 10 }));
  });

  it("marketplace hold: a body without externalRef or with a numeric clinicId is a 400, not a TypeError", async () => {
    await rejects(() => run(CreateSlotHoldBodyDto, { clinicId: "c", clinicianId: "d", typeId: "t", startsAt: "2030-01-01T10:00:00Z" }));
    await rejects(() => run(CreateSlotHoldBodyDto, { clinicId: 7, clinicianId: "d", typeId: "t", startsAt: "2030-01-01T10:00:00Z", externalRef: "r" }));
    await rejects(() => pipe.transform(undefined, { type: "body", metatype: CreateSlotHoldBodyDto }));
    const ok = await run(CreateSlotHoldBodyDto, { clinicId: "c", clinicianId: "d", typeId: "t", startsAt: "2030-01-01T10:00:00Z", externalRef: "r", visitAddress: { district: "maadi" }, patientName: "dropped" }) as Record<string, unknown>;
    assert.equal(ok.patientName, undefined);
    assert.deepEqual(ok.visitAddress, { district: "maadi" });
  });

  it("the global pipe stays strict for ordinary (non-lenient) DTOs", async () => {
    class Strict { }
    assert.equal(isLenient(Strict), false);
  });
});
