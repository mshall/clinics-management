import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assertEmailDomainAuthReady,
  isEmailDomainAuthReady,
  loadEmailDomainAuth,
} from "./email-domain-auth";
import { DevEmailProvider, SesEmailProvider } from "./email.provider";
import { EMAIL_TEMPLATE_KEYS, renderEmailTemplate } from "./email-templates";

describe("MS-05 transactional email", () => {
  it("renders bilingual templates for trial, invoice, password reset and security", () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const en = renderEmailTemplate(key, "en", {
        kind: "trial_ending",
        daysRemaining: 7,
        planName: "Pro",
        invoiceNumber: "INV-1",
        periodKey: "2026-11",
        total: "100.00",
        currency: "EGP",
        statementPath: "/api/v1/billing/statements/2026-11?format=pdf",
        resetLink: "https://app.example/reset?token=abc",
        event: "password_changed",
        detail: "sessions revoked",
      });
      const ar = renderEmailTemplate(key, "ar", {
        kind: "trial_ending",
        daysRemaining: 7,
        planName: "Pro",
        invoiceNumber: "INV-1",
        periodKey: "2026-11",
        total: "100.00",
        currency: "EGP",
        resetLink: "https://app.example/reset?token=abc",
        event: "password_changed",
      });
      assert.ok(en.subject.length > 3);
      assert.ok(ar.subject.length > 3);
      assert.ok(en.text.length > 10);
      assert.ok(ar.html.includes("dir=\"rtl\""));
    }
  });

  it("DKIM/SPF/DMARC must all be verified before production send (acceptance)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ms05-email-"));
    const path = join(dir, "email-domain-auth.json");
    writeFileSync(
      path,
      JSON.stringify({
        sendingDomain: "mail.kiorly.com",
        fromAddress: "noreply@mail.kiorly.com",
        region: "eu-central-1",
        dkimVerified: true,
        spfVerified: true,
        dmarcVerified: false,
      }),
    );
    const priorPath = process.env.EMAIL_DOMAIN_AUTH_PATH;
    const priorEnv = process.env.NODE_ENV;
    const priorDkim = process.env.EMAIL_DKIM_VERIFIED;
    const priorSpf = process.env.EMAIL_SPF_VERIFIED;
    const priorDmarc = process.env.EMAIL_DMARC_VERIFIED;
    process.env.EMAIL_DOMAIN_AUTH_PATH = path;
    delete process.env.EMAIL_DKIM_VERIFIED;
    delete process.env.EMAIL_SPF_VERIFIED;
    delete process.env.EMAIL_DMARC_VERIFIED;

    const auth = loadEmailDomainAuth(path);
    assert.equal(isEmailDomainAuthReady(auth), false);
    assert.throws(() => assertEmailDomainAuthReady(auth), /DMARC|EMAIL_DOMAIN_AUTH_INCOMPLETE/);

    process.env.NODE_ENV = "production";
    const priorMode = process.env.KIORLY_PROVIDER_MODE_EMAIL;
    process.env.KIORLY_PROVIDER_MODE_EMAIL = "real"; // the domain gate applies to real sends; mock (default) skips it
    const provider = new SesEmailProvider(new DevEmailProvider());
    const rendered = renderEmailTemplate("password_reset", "en", { resetLink: "https://x" });
    const blocked = await provider.send({ to: "owner@example.com", rendered }, auth);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.failureClass, "DOMAIN");
      assert.match(blocked.error, /DMARC|EMAIL_DOMAIN_AUTH_INCOMPLETE/);
    }

    writeFileSync(
      path,
      JSON.stringify({
        sendingDomain: "mail.kiorly.com",
        fromAddress: "noreply@mail.kiorly.com",
        region: "eu-central-1",
        dkimVerified: true,
        spfVerified: true,
        dmarcVerified: true,
      }),
    );
    const ready = loadEmailDomainAuth(path);
    assert.equal(isEmailDomainAuthReady(ready), true);
    assert.doesNotThrow(() => assertEmailDomainAuthReady(ready));
    // In mock mode SesEmailProvider falls through to the dev provider (no AWS call).
    process.env.KIORLY_PROVIDER_MODE_EMAIL = "mock";
    const ok = await provider.send({ to: "owner@example.com", rendered }, ready);
    assert.equal(ok.ok, true);

    process.env.NODE_ENV = priorEnv;
    if (priorMode === undefined) delete process.env.KIORLY_PROVIDER_MODE_EMAIL;
    else process.env.KIORLY_PROVIDER_MODE_EMAIL = priorMode;
    if (priorPath === undefined) delete process.env.EMAIL_DOMAIN_AUTH_PATH;
    else process.env.EMAIL_DOMAIN_AUTH_PATH = priorPath;
    if (priorDkim === undefined) delete process.env.EMAIL_DKIM_VERIFIED;
    else process.env.EMAIL_DKIM_VERIFIED = priorDkim;
    if (priorSpf === undefined) delete process.env.EMAIL_SPF_VERIFIED;
    else process.env.EMAIL_SPF_VERIFIED = priorSpf;
    if (priorDmarc === undefined) delete process.env.EMAIL_DMARC_VERIFIED;
    else process.env.EMAIL_DMARC_VERIFIED = priorDmarc;
  });
});
