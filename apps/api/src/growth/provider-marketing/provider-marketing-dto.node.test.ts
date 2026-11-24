import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { isLenient, AppValidationPipe } from "../../common/lenient-dto";
import {
  RecommendationStateBodyDto,
  SlotCardBodyDto,
  SocialRenderBodyDto,
  SocialShareBodyDto,
  VerificationCreateBodyDto,
  VerificationDecisionBodyDto,
  VerificationEvidenceBodyDto,
} from "./provider-marketing.dto";

const pipe = new AppValidationPipe();
const run = (metatype: new () => object, value: unknown) => pipe.transform(value, { type: "body", metatype }) as Promise<Record<string, unknown>>;
const plain = (o: unknown) => JSON.parse(JSON.stringify(o)) as unknown; // declared-but-absent fields are undefined
const rejects = (fn: () => Promise<unknown>) => assert.rejects(fn, BadRequestException);

describe("provider marketing DTOs (GRW-P2-C)", () => {
  it("are lenient and drop service-only fields a client must never set", async () => {
    for (const d of [SocialRenderBodyDto, SocialShareBodyDto, SlotCardBodyDto, RecommendationStateBodyDto, VerificationCreateBodyDto, VerificationEvidenceBodyDto, VerificationDecisionBodyDto]) assert.equal(isLenient(d), true);
    const out = await run(SocialRenderBodyDto, { templateId: "t", noLinkCreate: false, selfOnly: false, now: "2030-01-01", extra: 1 });
    assert.deepEqual(plain(out), { templateId: "t" });
    const card = await run(SlotCardBodyDto, { startsAt: ["2030-01-01T10:00:00Z"], selfOnly: false, now: "x" });
    assert.deepEqual(plain(card), { startsAt: ["2030-01-01T10:00:00Z"] });
  });

  it("an empty body is accepted (the service raises its stable required-field code)", async () => {
    for (const d of [SocialRenderBodyDto, SocialShareBodyDto, SlotCardBodyDto, VerificationCreateBodyDto, VerificationEvidenceBodyDto, VerificationDecisionBodyDto, RecommendationStateBodyDto]) await run(d, {});
  });

  it("render and share reject mistyped and oversized fields", async () => {
    await rejects(() => run(SocialRenderBodyDto, { templateId: 5 }));
    await rejects(() => run(SocialRenderBodyDto, { templateId: { a: 1 } }));
    await rejects(() => run(SocialRenderBodyDto, { customLine: "x".repeat(501) }));
    await rejects(() => run(SocialRenderBodyDto, { png: "yes" }));
    await rejects(() => run(SocialShareBodyDto, { channel: ["WHATSAPP"] }));
    await run(SocialRenderBodyDto, { templateId: "t", locale: "ar", customLine: "hello", png: true, clinicianId: null });
  });

  it("slot card: startsAt is a bounded list of strings", async () => {
    await rejects(() => run(SlotCardBodyDto, { startsAt: "2030-01-01T10:00:00Z" }));
    await rejects(() => run(SlotCardBodyDto, { startsAt: [1, 2] }));
    await rejects(() => run(SlotCardBodyDto, { startsAt: Array.from({ length: 21 }, () => "2030-01-01T10:00:00Z") }));
    await rejects(() => run(SlotCardBodyDto, { startsAt: ["x".repeat(41)] }));
    await run(SlotCardBodyDto, { startsAt: ["2030-01-01T10:00:00Z", "2030-01-01T11:00:00Z"] });
  });

  it("recommendation state: snoozeDays must be numeric", async () => {
    await rejects(() => run(RecommendationStateBodyDto, { snoozeDays: "soon" }));
    await rejects(() => run(RecommendationStateBodyDto, { status: 3 }));
    await run(RecommendationStateBodyDto, { clinicId: "c", status: "SNOOZED", snoozeDays: 7 });
    await run(RecommendationStateBodyDto, { clinicId: "c", status: "SNOOZED", snoozeDays: "7" });
  });

  it("verification: evidence is a bounded list of strings, values are bounded", async () => {
    await rejects(() => run(VerificationCreateBodyDto, { evidenceFileRefs: "a" }));
    await rejects(() => run(VerificationCreateBodyDto, { evidenceFileRefs: [{ a: 1 }] }));
    await rejects(() => run(VerificationCreateBodyDto, { evidenceFileRefs: Array.from({ length: 51 }, () => "f") }));
    await rejects(() => run(VerificationCreateBodyDto, { newValue: "x".repeat(2001) }));
    await rejects(() => run(VerificationEvidenceBodyDto, { evidenceFileRefs: [1] }));
    await run(VerificationCreateBodyDto, { clinicId: "c", field: "LICENCE_NUMBER", newValue: "123", evidenceFileRefs: ["file_1"] });
  });

  it("signed decision body: typed and bounded, unknown keys dropped", async () => {
    await rejects(() => run(VerificationDecisionBodyDto, { decision: 1 }));
    await rejects(() => run(VerificationDecisionBodyDto, { requestRef: ["a"] }));
    await rejects(() => run(VerificationDecisionBodyDto, { note: "x".repeat(2001) }));
    const ok = await run(VerificationDecisionBodyDto, { requestRef: "r", decision: "APPROVED", note: "ok", __proto__x: 1, admin: true });
    assert.deepEqual(plain(ok), { requestRef: "r", decision: "APPROVED", note: "ok" });
  });
});
