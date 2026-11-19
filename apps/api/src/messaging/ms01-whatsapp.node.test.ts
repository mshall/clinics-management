import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { resolveMarketTemplate, whatsAppConfigFromMarket } from "./whatsapp-market-config";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";
import { sendWhatsAppMessage } from "./whatsapp.provider";
import { nextRetryAt, workerStatusForFailure } from "./whatsapp-failure-policy";

describe("MS-01 WhatsApp provider", () => {
  it("market config resolves template names per template key", () => {
    const cfg = whatsAppConfigFromMarket({
      messaging: {
        whatsapp: {
          templates: {
            appointment_reminder_whatsapp: { name: "kiorly_appointment_reminder", language: "en", variables: ["name", "clinic", "time"] },
          },
        },
      },
    });
    const tpl = resolveMarketTemplate(cfg, "appointment_reminder_whatsapp");
    assert.equal(tpl?.name, "kiorly_appointment_reminder");
    assert.deepEqual(tpl?.variables, ["name", "clinic", "time"]);
  });

  it("blocks free-form WhatsApp in production", async () => {
    const prior = process.env.NODE_ENV;
    const priorMode = process.env.KIORLY_PROVIDER_MODE_WHATSAPP;
    process.env.NODE_ENV = "production";
    process.env.KIORLY_PROVIDER_MODE_WHATSAPP = "real"; // mock mode (the default) renders into the dev inbox instead
    const res = await sendWhatsAppMessage("+201000000001", "hello outside window");
    process.env.NODE_ENV = prior;
    if (priorMode === undefined) delete process.env.KIORLY_PROVIDER_MODE_WHATSAPP;
    else process.env.KIORLY_PROVIDER_MODE_WHATSAPP = priorMode;
    assert.equal(res.ok, false);
    assert.match((res as { error: string }).error, /template|free-form|24h/i);
  });

  it("webhook signature validation accepts valid HMAC", () => {
    const svc = new WhatsAppWebhookService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    process.env.WHATSAPP_APP_SECRET = "test-secret";
    const body = '{"entry":[]}';
    const sig = createHmac("sha256", "test-secret").update(body, "utf8").digest("hex");
    assert.equal(svc.assertSignature(body, `sha256=${sig}`), true);
    delete process.env.WHATSAPP_APP_SECRET;
  });

  it("retry policy caps attempts and classifies worker status", () => {
    assert.equal(workerStatusForFailure(true, 1), "RETRY");
    assert.equal(workerStatusForFailure(true, 5), "FAILED");
    assert.ok(nextRetryAt(1) instanceof Date);
    assert.equal(nextRetryAt(10), null);
  });
});