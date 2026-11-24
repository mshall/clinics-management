import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PlanKey } from "@prisma/client";
import jsQR from "jsqr";
import sharp from "sharp";
import { LINK_CODE_PATTERN } from "../acquisition-contract";
import { createWorld, prisma, type World } from "../growth-test-kit.test";
import { signLinkTouch } from "./link-touch";
import { PublicLinkController } from "./public-link.controller";
import { ProviderLinkCoreService } from "./provider-link-core.service";

const CHROME = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };
const dayCounters = async (linkId: string) => {
  const rows = await prisma.providerReferralLinkDaily.findMany({ where: { linkId } });
  return rows.reduce((a, r) => ({ visits: a.visits + r.visits, bookings: a.bookings + r.bookings, attended: a.attended + r.attended }), { visits: 0, bookings: 0, attended: 0 });
};

describe("GRW-P1-D1 provider links (real Postgres)", () => {
  let w: World;
  before(async () => {
    w = await createWorld("d1");
  });
  after(async () => {
    await w.cleanup();
  });

  it("creates links for every scope with unique 8-char Crockford codes, audited, standalone (no Kiorex connection)", async () => {
    const { links } = w.svc;
    const org = await links.create(w.A.admin, { ownerScope: "ORG", label: "Whole organisation", channelKind: "WEB_LINK" });
    const clinic = await links.create(w.A.admin, { clinicId: w.A.clinicId, ownerScope: "CLINIC", label: "Main clinic QR", channelKind: "QR_POSTER", tags: { utm_campaign: "Ramadan-2027" } });
    const branch = await links.create(w.A.admin, { clinicId: w.A.clinicId, ownerScope: "BRANCH", branchRef: w.A.branchId, label: "Branch B" });
    const doctor = await links.create(w.A.admin, { clinicId: w.A.clinicId, ownerScope: "DOCTOR", clinicianId: w.A.doc, label: "Dr one card", channelKind: "EMAIL_SIG" });
    const desk = await links.create(w.A.admin, { clinicId: w.A.clinicId, ownerScope: "DESK", deskLabel: "Reception 1", label: "Reception desk", channelKind: "QR_DESK" });
    const all = [org, clinic, branch, doctor, desk];
    for (const l of all) {
      assert.match(l.code, LINK_CODE_PATTERN);
      assert.equal(l.status, "ACTIVE");
      assert.ok(l.shortUrl.endsWith(`/q/${l.code}`));
    }
    assert.equal(new Set(all.map((l) => l.code)).size, 5);
    assert.equal(clinic.tags.utm_campaign, "ramadan-2027");
    assert.equal(clinic.tags.utm_medium, "qr", "channel default");
    assert.equal(doctor.clinicianId, w.A.doc);
    assert.equal(branch.branchRef, w.A.branchId);
    assert.equal(desk.deskLabel, "Reception 1");
    const audits = await prisma.auditLog.count({ where: { tenantId: w.A.tenantId, action: "growth.link.created" } });
    assert.equal(audits, 5);
    // no Kiorex connection exists for this organisation, yet creation worked
    assert.equal(await prisma.marketplaceListing.count({ where: { tenantId: w.A.tenantId, status: { not: "LIVE" } } }), 0);
  });

  it("rejects bad input with a stable code", async () => {
    const { links } = w.svc;
    const codeOf = async (p: Promise<unknown>) => {
      try {
        await p;
        return "OK";
      } catch (e) {
        const r = (e as { getResponse?: () => unknown }).getResponse?.() as { code?: string } | undefined;
        return r?.code ?? (e as { status?: number }).status ?? String(e);
      }
    };
    assert.equal(await codeOf(links.create(w.A.admin, { clinicId: w.A.clinicId, ownerScope: "DOCTOR", label: "x doc" })), "GROWTH_LINK_INVALID");
    assert.equal(await codeOf(links.create(w.A.admin, { clinicId: w.A.clinicId, ownerScope: "DESK", label: "desk no label" })), "GROWTH_LINK_INVALID");
    assert.equal(await codeOf(links.create(w.A.admin, { clinicId: w.A.clinicId, ownerScope: "NOPE", label: "bad scope" })), "GROWTH_LINK_INVALID");
    assert.equal(await codeOf(links.create(w.A.admin, { clinicId: w.A.clinicId, label: "a" })), "GROWTH_LINK_INVALID");
    assert.equal(await codeOf(links.create(w.A.admin, { clinicId: w.A.clinicId, label: "ok label", tags: { utm_source: "has space" } })), "GROWTH_LINK_INVALID");
    assert.equal(await codeOf(links.create(w.A.admin, { clinicId: w.A.clinicId, label: "ok label", channelKind: "FAX" })), "GROWTH_LINK_INVALID");
    // another organisation's clinic / doctor are simply not found
    assert.equal(await codeOf(links.create(w.A.admin, { clinicId: w.B.clinicId, label: "cross tenant" })), 404);
    assert.equal(await codeOf(links.create(w.A.admin, { clinicId: w.A.clinicId, ownerScope: "DOCTOR", clinicianId: w.B.doc, label: "cross doctor" })), 404);
    assert.equal(await codeOf(links.create(w.A.admin, { clinicId: w.A.clinicId, ownerScope: "BRANCH", branchRef: w.B.clinicId, label: "cross branch" })), 404);
  });

  it("permissions: marketing creates and pauses but cannot revoke or touch widget origins; reception and physicians only read or nothing", async () => {
    const { links } = w.svc;
    const mine = await links.create(w.A.marketing, { clinicId: w.A.clinicId, label: "Marketing link", channelKind: "SOCIAL" });
    assert.equal((await links.update(w.A.marketing, mine.id, { status: "PAUSED" })).status, "PAUSED");
    await assert.rejects(links.update(w.A.marketing, mine.id, { status: "REVOKED" }), { status: 403 });
    await assert.rejects(links.putWidget(w.A.marketing, { clinicId: w.A.clinicId, allowedOrigins: [] }), { status: 403 });
    await assert.rejects(links.create(w.A.recep, { clinicId: w.A.clinicId, label: "Reception link" }), { status: 403 });
    assert.ok((await links.list(w.A.recep)).items.length > 0, "reception can read");
    await assert.rejects(links.list(w.A.physician), { status: 403 });
    assert.deepEqual((await links.access(w.A.marketing)).can, { view: true, create: true, update: true, revoke: false, widget: false });
    assert.deepEqual((await links.access(w.A.admin)).can, { view: true, create: true, update: true, revoke: true, widget: true });
    assert.equal((await links.access(w.A.admin)).plan.key, "PRO");
  });

  it("tenant isolation: another organisation cannot list, read, patch, export or count your links", async () => {
    const { links } = w.svc;
    const mine = await links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Isolated link" });
    const theirs = await links.list(w.B.admin);
    assert.equal(theirs.items.length, 0);
    await assert.rejects(links.update(w.B.admin, mine.id, { label: "hijack" }), { status: 404 });
    await assert.rejects(links.qrSvgFor(w.B.admin, mine.id), { status: 404 });
    await assert.rejects(links.posterHtml(w.B.admin, mine.id, {}), { status: 404 });
    assert.equal((await links.summary(w.B.admin)).totals.visits, 0);
    // a code of tenant A on tenant B's page is ignored: no lt, no visit
    const bLink = await w.svc.pages.getForClinic(w.B.admin, w.B.clinicId);
    const page = await w.svc.pages.publicPage(bLink.slug, { s: mine.code });
    assert.equal(page.tracked, false);
    assert.equal(page.lt, null);
    assert.equal((await dayCounters(mine.id)).visits, 0);
  });

  it("`?s=` unknown or malformed is ignored; a known ACTIVE code counts one non-bot visit and returns a signed lt; bots are not counted", async () => {
    const { links, pages } = w.svc;
    const l = await links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Counting link", channelKind: "WHATSAPP_SHARE" });
    const slug = (await pages.getForClinic(w.A.admin, w.A.clinicId)).slug;
    for (const junk of ["ZZZZZZZZ", "bad", "7K3M9QXI", "'; drop table", undefined]) {
      const p = await pages.publicPage(slug, { s: junk, bot: false });
      assert.equal(p.tracked, false);
      assert.equal(p.lt, null);
    }
    const hit = await pages.publicPage(slug, { s: l.code.toLowerCase() });
    assert.equal(hit.tracked, true);
    assert.ok(hit.lt);
    await pages.publicPage(slug, { s: l.code, bot: true });
    await pages.publicPage(slug, { s: l.code });
    assert.deepEqual(await dayCounters(l.id), { visits: 2, bookings: 0, attended: 0 }, "two human visits, the bot hit is not counted");
    assert.ok(hit.doctors.every((d) => /^https?:\/\//.test(d.widgetUrl) && d.widgetUrl.includes("lt=")), "the Book button points at a working destination and carries the signed touch");
    assert.match(hit.widgetUrl, /^https?:\/\//);
    // the plain page keeps working without a link, with a destination too
    const plain = await pages.publicPage(slug);
    assert.ok(plain.doctors.every((d) => /^https?:\/\//.test(d.widgetUrl) && !d.widgetUrl.includes("lt=")));
  });

  it("paused and revoked links stop signing lt and counting; a revoked link cannot be reactivated, its QR and poster are refused", async () => {
    const { links, pages } = w.svc;
    const slug = (await pages.getForClinic(w.A.admin, w.A.clinicId)).slug;
    const l = await links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Lifecycle link" });
    assert.ok((await pages.publicPage(slug, { s: l.code })).lt);
    await links.update(w.A.admin, l.id, { status: "PAUSED" });
    assert.equal((await pages.publicPage(slug, { s: l.code })).lt, null);
    await links.update(w.A.admin, l.id, { status: "ACTIVE" });
    assert.ok((await pages.publicPage(slug, { s: l.code })).lt);
    const before = (await dayCounters(l.id)).visits;
    const revoked = await links.update(w.A.admin, l.id, { status: "REVOKED" });
    assert.equal(revoked.status, "REVOKED");
    assert.ok(revoked.revokedAt);
    assert.equal((await pages.publicPage(slug, { s: l.code })).lt, null);
    assert.equal((await dayCounters(l.id)).visits, before);
    await assert.rejects(links.update(w.A.admin, l.id, { status: "ACTIVE" }), { status: 409 });
    await assert.rejects(links.qrSvgFor(w.A.admin, l.id), { status: 409 });
    await assert.rejects(links.posterHtml(w.A.admin, l.id, {}), { status: 409 });
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: w.A.tenantId, action: "growth.link.revoked", resourceId: l.id } }));
    // a token signed while the link was active no longer attributes a booking either
    const stale = signLinkTouch({ tenantId: w.A.tenantId, code: l.code })!;
    assert.equal(await new ProviderLinkCoreService(prisma as never).verifyForBooking(stale, w.A.tenantId), null);
  });

  it("QR codes decode to the short link; posters, desk and doctor cards render in Arabic and English; the vCard carries only public data", async () => {
    const { links } = w.svc;
    const doc = await links.create(w.A.admin, { clinicId: w.A.clinicId, ownerScope: "DOCTOR", clinicianId: w.A.doc, label: "Printable doctor" });
    const svg = await links.qrSvgFor(w.A.admin, doc.id);
    const { data, info } = await sharp(Buffer.from(svg), { density: 300 }).resize({ width: 600, kernel: "nearest" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data, doc.shortUrl);
    const png = await links.qrPngFor(w.A.admin, doc.id, 400);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    const ar = await links.posterHtml(w.A.admin, doc.id, { lang: "ar", size: "A5" });
    assert.match(ar, /dir="rtl"/);
    assert.ok(ar.includes("د. أحمد"));
    const en = await links.posterHtml(w.A.admin, doc.id, { lang: "en", kind: "DOCTOR_CARD" });
    assert.equal((en.match(/class="card"/g) ?? []).length, 10);
    const desk = await links.create(w.A.admin, { clinicId: w.A.clinicId, ownerScope: "DESK", deskLabel: "Front desk", label: "Desk card" });
    assert.ok((await links.posterHtml(w.A.admin, desk.id, { lang: "en" })).includes("Book your next visit"));
    await assert.rejects(links.posterHtml(w.A.admin, desk.id, { kind: "DOCTOR_CARD" }), { status: 400 });
    const vcf = await links.vcard(w.A.admin, doc.id);
    assert.match(vcf, /^BEGIN:VCARD\r\nVERSION:3\.0/);
    assert.ok(vcf.includes(`URL:`) && vcf.includes("TEL;TYPE=WORK,VOICE:201000000090"));
    assert.ok(!/@example\.com|passwordHash|nationalId/.test(vcf));
    await assert.rejects(links.vcard(w.A.admin, desk.id), { status: 400 });
  });

  it("plan limit: LITE allows 3 live links; revoking frees a slot", async () => {
    const lite = await createWorld("d1lite", { plan: PlanKey.LITE });
    try {
      const mk = (n: number) => lite.svc.links.create(lite.A.admin, { clinicId: lite.A.clinicId, label: `Lite ${n}` });
      const a = await mk(1);
      await mk(2);
      await mk(3);
      await assert.rejects(mk(4), (e: { status?: number; getResponse?: () => { code?: string } }) => e.status === 409 && e.getResponse?.().code === "GROWTH_LINK_LIMIT_REACHED");
      await lite.svc.links.update(lite.A.admin, a.id, { status: "REVOKED" });
      assert.ok(await mk(5));
      assert.equal((await lite.svc.links.access(lite.A.admin)).can.widget, false, "the widget configurator is Pro and above");
      await assert.rejects(lite.svc.links.putWidget(lite.A.admin, { clinicId: lite.A.clinicId, allowedOrigins: [] }), { status: 402 });
    } finally {
      await lite.cleanup();
    }
  });

  it("widget settings: validated like the contract, audited, projected to Kiorex as PROVIDER_PROFILE_UPDATED.widgetOrigins", async () => {
    const { links } = w.svc;
    const codeOf = async (p: Promise<unknown>) => {
      try {
        await p;
        return "OK";
      } catch (e) {
        return ((e as { getResponse?: () => { code?: string; reason?: string } }).getResponse?.() ?? {}) as { code?: string; reason?: string };
      }
    };
    const put = (origins: unknown, extra: Record<string, unknown> = {}) => links.putWidget(w.A.admin, { clinicId: w.A.clinicId, enabled: true, allowedOrigins: origins, ...extra });
    assert.deepEqual(await codeOf(put(["https://*.example.com"])), { code: "GROWTH_WIDGET_ORIGIN_INVALID", message: "Origin not allowed: WILDCARD", reason: "WILDCARD", origin: "https://*.example.com" });
    assert.equal(((await codeOf(put(["http://example.com"]))) as { reason: string }).reason, "NOT_HTTPS");
    const eleven = Array.from({ length: 11 }, (_, i) => `https://s${i}.example.com`);
    assert.equal(((await codeOf(put(eleven))) as { code: string }).code, "GROWTH_WIDGET_TOO_MANY_ORIGINS");
    assert.equal(((await codeOf(put(["https://ok.example.com"], { theme: "neon" }))) as { code: string }).code, "GROWTH_WIDGET_SETTINGS_INVALID");
    assert.equal(((await codeOf(put(["https://ok.example.com"], { settings: { doctorIds: [w.B.doc] } }))) as { code: string }).code, "GROWTH_WIDGET_SETTINGS_INVALID");
    assert.equal(await prisma.bookingWidgetConfig.count({ where: { clinicId: w.A.clinicId } }), 0, "rejected requests change nothing");

    const before = await prisma.outboxEvent.count({ where: { tenantId: w.A.tenantId, type: "PROVIDER_PROFILE_UPDATED" } });
    const saved = await put(["https://www.clinic-a.example.com", "https://clinic-a.example.com:8443"], { theme: "dark", locale: "en", settings: { brandColor: "#0D9488", languages: ["ar", "en"], doctorIds: [w.A.doc] } });
    assert.deepEqual(saved.allowedOrigins, ["https://www.clinic-a.example.com", "https://clinic-a.example.com:8443"]);
    assert.equal(saved.enabled, true);
    assert.equal(saved.settings.brandColor, "#0d9488");
    assert.ok(saved.snippets?.script.includes("data-kx-widget") && saved.snippets.iframe.includes("<iframe"));
    const events = await prisma.outboxEvent.findMany({ where: { tenantId: w.A.tenantId, type: "PROVIDER_PROFILE_UPDATED" }, orderBy: { createdAt: "desc" }, take: 2 });
    assert.equal((await prisma.outboxEvent.count({ where: { tenantId: w.A.tenantId, type: "PROVIDER_PROFILE_UPDATED" } })) - before, 2, "one per published listing");
    for (const e of events) assert.deepEqual((e.payload as { widgetOrigins: string[] }).widgetOrigins, saved.allowedOrigins);
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: w.A.tenantId, action: "growth.widget.updated" } }));
    // disabling the widget projects an empty allowlist (frame-ancestors falls back to none)
    await links.putWidget(w.A.admin, { clinicId: w.A.clinicId, enabled: false, allowedOrigins: saved.allowedOrigins });
    const last = await prisma.outboxEvent.findFirst({ where: { tenantId: w.A.tenantId, type: "PROVIDER_PROFILE_UPDATED" }, orderBy: { createdAt: "desc" } });
    assert.deepEqual((last!.payload as { widgetOrigins: string[] }).widgetOrigins, []);
    // organisation B sees nothing of A's widget
    assert.deepEqual((await links.getWidget(w.B.admin, w.B.clinicId)).allowedOrigins, []);
    await assert.rejects(links.getWidget(w.B.admin, w.A.clinicId), { status: 404 });
  });

  it("the public short link resolves a code to the tracked page, never to a caller URL, and keeps a revoked QR working without attribution", async () => {
    const { links, core } = w.svc;
    const slug = (await w.svc.pages.getForClinic(w.A.admin, w.A.clinicId)).slug;
    const l = await links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Short link" });
    const res = () => {
      const r: { status?: number; location?: string; json?: unknown } = {};
      return Object.assign(r, { status: (s: number) => ({ json: (j: unknown) => ((r.status = s), (r.json = j), r) }), redirect: (s: number, u: string) => ((r.status = s), (r.location = u), r) });
    };
    const ctrl = new PublicLinkController(prisma as never, core);
    const ok = res();
    await ctrl.qr(l.code, undefined, ok as never);
    assert.equal(ok.status, 302);
    assert.ok(ok.location!.endsWith(`/b/${slug}?s=${l.code}`));
    const asJson = res();
    await ctrl.qr(l.code, "application/json", asJson as never);
    assert.deepEqual((asJson.json as { target: string }).target, ok.location);
    await assert.rejects(ctrl.qr("ZZZZZZZZ", undefined, res() as never), { status: 404 });
    await assert.rejects(ctrl.qr("https://evil.example", undefined, res() as never), { status: 404 });
    await links.update(w.A.admin, l.id, { status: "REVOKED" });
    const revoked = res();
    await ctrl.qr(l.code, undefined, revoked as never);
    assert.ok(revoked.location!.endsWith(`/b/${slug}`) && !revoked.location!.includes("?s="));
    // go/<slug>: redirects to the Kiorex canonical URL with the signed touch, only to configured hosts
    const active = await links.create(w.A.admin, { clinicId: w.A.clinicId, label: "Go link", channelKind: "SOCIAL" });
    const go = res();
    await ctrl.go(slug, active.code, { headers: CHROME } as never, go as never);
    assert.equal(go.status, 302);
    const u = new URL(go.location!);
    assert.match(u.pathname, new RegExp(`^/ar/eg/clinic/${slug}$`));
    assert.ok(u.searchParams.get("lt") && u.searchParams.get("utm_medium") === "social");
    await assert.rejects(ctrl.go("no-such-page-d1", undefined, { headers: CHROME } as never, res() as never), { status: 404 });
  });

  it("summary and performance are counts only and respect the organisation", async () => {
    const { links, insights } = w.svc;
    const s = await links.summary(w.A.admin, { days: 30 });
    assert.ok(s.totals.visits >= 2);
    // Scrub the human note and channel enum EMAIL_SIG (contains "email") before PHI substring scan.
    const text = JSON.stringify(s)
      .replace(/"note":"[^"]*"/g, '""')
      .replace(/"EMAIL_SIG"/g, '""');
    assert.ok(!/"phone"|"mrn"|"nationalId"|"email"\s*:/i.test(text), "counts only");
    assert.ok(!/\bpatient\b/i.test(text), "counts only");
    const perf = await insights.performance(w.A.admin, { days: 30 });
    assert.equal(perf.providerOriginated.bookings, 0);
    assert.equal((await insights.performance(w.B.admin, {})).links.visits, 0);
    const recs = await insights.recommendations(w.A.admin, { clinicId: w.A.clinicId });
    assert.ok(recs.items.some((r) => r.id === "AVAILABILITY_MISSING"), "doctors without availability are flagged");
    assert.ok(recs.items.every((r) => !r.id.match(/UPSELL|TESTIMONIAL|PROMO/)));
  });
});
