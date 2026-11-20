import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient, UsageMetric } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { ConsentPolicyService } from "../compliance/consent-policy.service";
import { CONSENT_PURPOSE_AI } from "../compliance/consent-policy.constants";
import type { PrismaService } from "../prisma/prisma.service";
import { UsageMeterService } from "../usage/usage-meter.service";
import { ClinicAiService } from "./clinic-ai.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;

describe("AI-02 scribe STT integration", () => {
  let tenantId: string;
  let encounterId: string;
  let patientId: string;
  let clinicAi: ClinicAiService;

  before(async () => {
    await prisma.$connect();
    const enc = await prisma.encounter.findFirst({
      where: { status: { not: "FINALIZED" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, tenantId: true, patientId: true },
    });
    assert.ok(enc, "need a draft encounter");
    tenantId = enc.tenantId;
    encounterId = enc.id;
    patientId = enc.patientId;
    const consent = new ConsentPolicyService(prismaSvc, new AuditService(prismaSvc));
    await consent.capture(tenantId, patientId, CONSENT_PURPOSE_AI, {
      granted: true,
      source: "ai02-test",
      signerName: "Test",
    });
    clinicAi = new ClinicAiService(prismaSvc, consent, new UsageMeterService(prismaSvc));
  });

  after(async () => {
    await prisma.aiScribeSession.deleteMany({ where: { tenantId, encounterId } });
    await prisma.$disconnect();
  });

  it("chunked upload → stop yields draft in pilot budget; approve purges audio by default", async () => {
    const session = await clinicAi.startScribeSession(tenantId, encounterId, { patientConsent: true });
    assert.equal(session.status, "RECORDING");
    assert.ok(session.consentGrantedAt);

    // Simulate ~10 minutes of audio as small chunks (byte length drives fallback seconds if needed).
    const tiny = Buffer.from("fake-webm-chunk").toString("base64");
    await clinicAi.uploadAudioChunk(tenantId, session.id, { seq: 0, payloadB64: tiny, mimeType: "audio/webm" });
    await clinicAi.uploadAudioChunk(tenantId, session.id, { seq: 1, payloadB64: tiny, mimeType: "audio/webm" });

    const stopped = await clinicAi.stopScribeSession(tenantId, session.id, { audioSeconds: 10 * 60 });
    assert.equal(stopped.status, "READY");
    assert.equal(stopped.pilotBenchmarkOk, true);
    assert.ok((stopped.draftLatencyMs ?? 999_999) < 60_000);
    assert.ok(stopped.transcript && /pain|بطن/i.test(stopped.transcript));

    const beforeApprove = await clinicAi.getScribeSession(tenantId, session.id);
    assert.ok(beforeApprove.audioChunkCount >= 2);

    const approved = await clinicAi.approveScribeDraft(tenantId, session.id, {
      subjective: "Reviewed RUQ pain",
      plan: "PPI + ultrasound",
    });
    assert.equal(approved.audioPurged, true);
    assert.equal(approved.audioRetained, false);

    const after = await clinicAi.getScribeSession(tenantId, session.id);
    assert.equal(after.audioChunkCount, 0);
    assert.equal(after.hasPersistedAudio, false);

    const meter = await prisma.usageCounter.findFirst({
      where: { tenantId, metric: UsageMetric.AI_SCRIBE_MINUTES },
    });
    assert.ok(meter && Number(meter.quantity) >= 10);
  });

  it("retains audio after sign-off only when the clinic opts in", async () => {
    const session = await clinicAi.startScribeSession(tenantId, encounterId, {
      patientConsent: true,
      retainAudioAfterSignOff: true,
    });
    await clinicAi.uploadAudioChunk(tenantId, session.id, {
      seq: 0,
      payloadB64: Buffer.from("keep-me").toString("base64"),
    });
    await clinicAi.stopScribeSession(tenantId, session.id, { audioSeconds: 30 });
    const approved = await clinicAi.approveScribeDraft(tenantId, session.id, {});
    assert.equal(approved.audioRetained, true);
    assert.equal(approved.audioPurged, false);
    const after = await clinicAi.getScribeSession(tenantId, session.id);
    assert.ok(after.audioChunkCount >= 1);
  });
});
