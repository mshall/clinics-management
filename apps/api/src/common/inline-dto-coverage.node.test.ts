import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { AuthRefreshBodyDto, AuthOtpVerifyBodyDto } from "../auth/auth.controller.dto";
import { BillingPreviewSeatsBodyDto, BillingRecordPaymentBodyDto } from "../billing/billing.controller.dto";
import { PatientMoneyCancelPackageBodyDto, PatientMoneyApproveRefundBodyDto } from "../billing/patient-money.controller.dto";
import { CreateSlotHoldBodyDto } from "../marketplace/slot-hold.dto";
import { PatientActiveProblemBodyDto, PatientFamilyLinkBodyDto } from "../patients/patients.free-form.dto";
import { SchedulingAddWaitlistBodyDto, SchedulingPatchTypeBodyDto, SchedulingPutAvailabilityBodyDto, SchedulingSaveTypeBodyDto, SchedulingSeriesBodyDto } from "../scheduling/scheduling.free-form.dto";
import { ClinicalUpsertTemplateBodyDto } from "../clinical/clinical.free-form.dto";
import { MobilePushTokenBodyDto, MobileRecordVitalsBodyDto, MobileRegisterDeviceBodyDto } from "../mobile/mobile.controller.dto";
import { BoundedObjectPipe } from "./bounded-json";
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

describe("no free-form Record<string, unknown> bodies (ratchet)", () => {
  it("a body typed Record<string, unknown> must go through a BoundedObjectPipe", () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/@Body\(([^)]*)\)\s+\w+\??:\s*Record<string,\s*unknown>/g)) if (!/BoundedObjectPipe/.test(m[1] ?? "") && !/BoundedObjectPipe\(/.test(text.slice(m.index!, m.index! + 200))) offenders.push(`${f.slice(SRC.length + 1)}:${text.slice(0, m.index).split("\n").length}`);
    }
    assert.deepEqual(offenders, [], "use a validated DTO class, or @Body(new BoundedObjectPipe(limits)) for a genuinely free-form body");
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

describe("the former Record<string, unknown> bodies are validated DTOs (EDGE closure: free-form bodies)", () => {
  const deep = (n: number): unknown => (n === 0 ? {} : { a: deep(n - 1) });
  it("patients: active problem needs labelEn, a known status and an ISO date; family link needs a known relation", async () => {
    await run(PatientActiveProblemBodyDto, { labelEn: "Asthma", status: "ACTIVE", onsetDate: "2024-05-01" });
    for (const bad of [{}, { labelEn: "" }, { labelEn: 5 }, { labelEn: "x", status: "WRONG" }, { labelEn: "x", onsetDate: "yesterday" }, { labelEn: "x".repeat(400) }]) await rejects(() => run(PatientActiveProblemBodyDto, bad));
    await run(PatientFamilyLinkBodyDto, { toPatientId: "p1", relation: "SPOUSE" });
    for (const bad of [{}, { toPatientId: "p1" }, { toPatientId: "p1", relation: "NOPE" }, { toPatientId: ["a"], relation: "SPOUSE" }]) await rejects(() => run(PatientFamilyLinkBodyDto, bad));
  });
  it("scheduling: appointment types take numbers or numeric strings in range, booleans stay booleans", async () => {
    await run(SchedulingSaveTypeBodyDto, { nameEn: "Checkup", durationMinutes: 20, feeAmount: "150.50", depositAmount: "", marketplaceBookable: true, clinicId: null });
    for (const bad of [{}, { nameEn: "" }, { nameEn: "x", durationMinutes: 0 }, { nameEn: "x", durationMinutes: 5000 }, { nameEn: "x", feeAmount: -1 }, { nameEn: "x", feeAmount: "abc" }, { nameEn: "x", isActive: "yes" }, { nameEn: "x", maxDaysAhead: 1e9 }, { nameEn: "x", depositAmount: {} }]) await rejects(() => run(SchedulingSaveTypeBodyDto, bad));
    await run(SchedulingPatchTypeBodyDto, { feeAmount: 200 });
    await run(SchedulingPatchTypeBodyDto, {});
    await rejects(() => run(SchedulingPatchTypeBodyDto, { feeAmount: [1] }));
  });
  it("scheduling: availability needs ids and a bounded week template; waitlist and series need ids and valid dates", async () => {
    await run(SchedulingPutAvailabilityBodyDto, { clinicId: "c", clinicianId: "u", weekJson: { days: [] }, blockedJson: [] });
    for (const bad of [{}, { clinicId: "c", clinicianId: "u" }, { clinicId: "c", clinicianId: "u", weekJson: "str" }, { clinicId: "c", clinicianId: "u", weekJson: deep(40) }, { clinicId: 1, clinicianId: "u", weekJson: {} }]) await rejects(() => run(SchedulingPutAvailabilityBodyDto, bad));
    await run(SchedulingAddWaitlistBodyDto, { clinicId: "c", patientId: "p", preferredFrom: "2030-01-01T10:00:00Z" });
    for (const bad of [{}, { clinicId: "c" }, { clinicId: "c", patientId: "p", preferredFrom: "soon" }, { clinicId: "c", patientId: "p", notes: "n".repeat(3000) }]) await rejects(() => run(SchedulingAddWaitlistBodyDto, bad));
    await run(SchedulingSeriesBodyDto, { clinicId: "c", patientId: "p", clinicianId: "u", label: "Physio", totalSessions: "6", startsOn: "2030-02-01" });
    for (const bad of [{}, { clinicId: "c", patientId: "p", clinicianId: "u", label: "x", startsOn: "2030-02-01" }, { clinicId: "c", patientId: "p", clinicianId: "u", label: "x", totalSessions: 0, startsOn: "2030-02-01" }, { clinicId: "c", patientId: "p", clinicianId: "u", label: "x", totalSessions: 3, startsOn: "x" }, { clinicId: "c", patientId: "p", clinicianId: "u", label: "x", totalSessions: 3, cadenceDays: 0, startsOn: "2030-02-01" }]) await rejects(() => run(SchedulingSeriesBodyDto, bad));
  });
  it("clinical form template: specialty is a known value and the section tree is bounded", async () => {
    await run(ClinicalUpsertTemplateBodyDto, { clinicId: "c", specialty: "GENERAL_MEDICINE", name: "Visit", sectionsJson: { sections: [] } });
    for (const bad of [{}, { clinicId: "c", specialty: "X", name: "n", sectionsJson: {} }, { clinicId: "c", specialty: "GENERAL_MEDICINE", name: "n" }, { clinicId: "c", specialty: "GENERAL_MEDICINE", name: "n", sectionsJson: "str" }, { clinicId: "c", specialty: "GENERAL_MEDICINE", name: "n", sectionsJson: deep(40) }, { clinicId: "c", specialty: "GENERAL_MEDICINE", name: "n", sectionsJson: { a: "x".repeat(600_000) } }]) await rejects(() => run(ClinicalUpsertTemplateBodyDto, bad));
  });
  it("mobile: device registration, push token and vitals", async () => {
    await run(MobileRegisterDeviceBodyDto, { deviceId: "d1", platform: "ios", name: "iPhone" });
    for (const bad of [{}, { deviceId: "d", platform: "tv", name: "n" }, { deviceId: "d".repeat(100), platform: "ios", name: "n" }, { deviceId: "d", platform: "ios" }]) await rejects(() => run(MobileRegisterDeviceBodyDto, bad));
    await run(MobilePushTokenBodyDto, { provider: "expo", token: "ExponentPushToken[x]" });
    for (const bad of [{}, { provider: "fcm", token: "t" }, { provider: "expo", token: "" }, { provider: "expo", token: "t".repeat(400) }]) await rejects(() => run(MobilePushTokenBodyDto, bad));
    await run(MobileRecordVitalsBodyDto, { patientId: "p", systolic: 120, diastolic: 80, spo2: null });
    for (const bad of [{}, { patientId: "p", systolic: "high" }, { patientId: "p", pulse: Infinity }, { patientId: 7 }]) await rejects(() => run(MobileRecordVitalsBodyDto, bad));
  });
  it("data explorer / operation note: a bounded JSON object, never an array, a string or a polluting key", () => {
    const bounded = new BoundedObjectPipe({ maxBytes: 1024, maxDepth: 3 }, false);
    assert.deepEqual(bounded.transform({ a: { b: 1 } }), { a: { b: 1 } });
    for (const bad of [undefined, null, [], "x", 5, deep(10), { s: "x".repeat(2000) }, JSON.parse('{"__proto__":{"x":1}}')]) assert.throws(() => bounded.transform(bad), BadRequestException);
  });
});

describe("nested objects are required, not just validated when present (a TypeError is a 500 now)", () => {
  it("collect-visit-balance and the provider profile reject a body without the nested object", async () => {
    const { CollectVisitBalanceDto } = await import("../front-desk/dto/collect-visit-balance.dto");
    const { PutProviderProfileDto } = await import("../marketplace/dto/put-provider-profile.dto");
    await rejects(() => run(CollectVisitBalanceDto, {}));
    await rejects(() => run(PutProviderProfileDto, {}));
  });
  it("no @ValidateNested() property is left without @IsDefined / @IsOptional / @ValidateIf (ratchet)", () => {
    const offenders: string[] = [];
    const dtoFiles = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? dtoFiles(p) : /\.dto\.ts$/.test(p) ? [p] : []; });
    for (const f of dtoFiles(SRC)) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/((?:[ \t]*@\w+\([^\n]*\)\n|[ \t]*\/\/[^\n]*\n)+)[ \t]*(\w+)(\?|!)?:[^;\n]+;/g)) {
        const dec = m[1] ?? "";
        if (dec.includes("@ValidateNested") && !/@(IsOptional|IsDefined|ValidateIf|IsNotEmptyObject)\b/.test(dec) && !dec.includes("each: true") && m[3] !== "?") offenders.push(`${f.slice(SRC.length + 1)}: ${m[2]}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});
