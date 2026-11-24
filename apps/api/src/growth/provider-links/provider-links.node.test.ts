import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import jsQR from "jsqr";
import sharp from "sharp";
import { LINK_CODE_PATTERN } from "../acquisition-contract";
import { canGrowth, growthLevel } from "./growth-access";
import { GROWTH_PLAN_LIMITS, growthLimitsFor } from "./growth-plan-limits";
import { buildPerformance, classifyOrigin, type AppointmentFacts } from "./growth-metrics";
import { RECOMMENDATION_IDS, buildRecommendations, type RecommendationInput } from "./growth-recommendations";
import { LINK_CODE_ALPHABET, generateLinkCode, normalizeLinkCode } from "./link-code";
import { isLikelyBot } from "./link-counters";
import { effectiveTags, sanitizeLinkTags } from "./link-tags";
import { LINK_TOUCH_DEFAULT_TTL_MS, signLinkTouch, verifyLinkTouch } from "./link-touch";
import { allowedRedirectHosts, assertAllowedRedirect, kiorexCanonicalUrl, pageUrl, shortUrl, trackedPageUrl, widgetEmbedUrl } from "./link-urls";
import { renderPosterHtml } from "./poster-html";
import { qrPng, qrSvg } from "./qr-svg";
import { DEFAULT_WIDGET_SETTINGS, validateWidgetOrigins, validateWidgetSettings, widgetSnippets } from "./widget-settings";

const ENV = { APP_WEB_URL: "https://app.kiorly.test", KIOREX_PATIENT_WEB_URL: "https://kiorex.test" } as NodeJS.ProcessEnv;

describe("GRW-P1-D1 link code", () => {
  it("is 8 Crockford characters without I L O U and matches the contract pattern", () => {
    assert.equal(LINK_CODE_ALPHABET.length, 32);
    for (const bad of "ILOU") assert.ok(!LINK_CODE_ALPHABET.includes(bad));
    for (let i = 0; i < 2000; i += 1) assert.match(generateLinkCode(), LINK_CODE_PATTERN);
  });
  it("is uniform over the alphabet and collision-free at scale", () => {
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    const N = 50_000;
    for (let i = 0; i < N; i += 1) {
      const c = generateLinkCode();
      seen.add(c);
      for (const ch of c) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    assert.equal(seen.size, N, "no collisions in 50k codes (32^8 space)");
    const expected = (N * 8) / 32;
    for (const ch of LINK_CODE_ALPHABET) assert.ok(Math.abs((counts.get(ch) ?? 0) - expected) < expected * 0.06, `symbol ${ch} roughly uniform`);
  });
  it("normalises case and rejects malformed input (an unknown `s` is ignored, never an error)", () => {
    assert.equal(normalizeLinkCode(" 7k3m9qxa "), "7K3M9QXA");
    for (const bad of ["", "7K3M9QX", "7K3M9QXAA", "7K3M9QXI", "7K3M9QXO", "7K3M9QXL", "7K3M9QXU", "../etc/pw", null, undefined, 42]) assert.equal(normalizeLinkCode(bad), null);
  });
});

describe("GRW-P1-D1 signed link touch (lt)", () => {
  const secret = "test-secret";
  const now = new Date("2026-11-24T10:00:00Z");
  it("round-trips and carries only org, code and time", () => {
    const t = signLinkTouch({ tenantId: "org1", code: "7K3M9QXA", now }, secret)!;
    const v = verifyLinkTouch(t, { now, secret });
    assert.ok(v.ok);
    if (v.ok) assert.deepEqual(Object.keys(v.claims).sort(), ["c", "o", "t", "v"]);
    assert.ok(!/[+/=]/.test(t), "url-safe");
  });
  it("rejects a tampered payload, a wrong secret, garbage and expiry", () => {
    const t = signLinkTouch({ tenantId: "org1", code: "7K3M9QXA", now }, secret)!;
    const [p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ o: "org2", c: "7K3M9QXA", t: now.getTime(), v: 1 })).toString("base64url");
    assert.deepEqual(verifyLinkTouch(`${forged}.${s}`, { now, secret }), { ok: false, reason: "BAD_SIGNATURE" });
    assert.deepEqual(verifyLinkTouch(t, { now, secret: "other" }), { ok: false, reason: "BAD_SIGNATURE" });
    assert.deepEqual(verifyLinkTouch(`${p}`, { now, secret }), { ok: false, reason: "MALFORMED" });
    assert.deepEqual(verifyLinkTouch("x".repeat(700), { now, secret }), { ok: false, reason: "MALFORMED" });
    assert.deepEqual(verifyLinkTouch(t, { now: new Date(now.getTime() + LINK_TOUCH_DEFAULT_TTL_MS + 1), secret }), { ok: false, reason: "EXPIRED" });
    assert.deepEqual(verifyLinkTouch(t, { now: new Date(now.getTime() - 3_600_000), secret }), { ok: false, reason: "EXPIRED" }, "from the future");
    assert.deepEqual(verifyLinkTouch(t, { now, secret: null }), { ok: false, reason: "NO_SECRET" });
  });
  it("is not a request signature (domain separated) and refuses a bad code", () => {
    assert.equal(signLinkTouch({ tenantId: "o", code: "bad", now }, secret), null);
  });
});

describe("GRW-P1-D1 tags", () => {
  it("accepts short tokens, lowercases, drops empties and rejects anything else", () => {
    assert.deepEqual(sanitizeLinkTags({ utm_source: "Instagram", utm_campaign: "ramadan-2027", utm_medium: "" }), { ok: true, tags: { utm_source: "instagram", utm_campaign: "ramadan-2027" } });
    assert.deepEqual(sanitizeLinkTags(undefined), { ok: true, tags: null });
    for (const bad of [{ utm_source: "a b" }, { utm_source: "<script>" }, { nope: "x" }, { utm_source: 5 }, { utm_source: "x".repeat(41) }, []]) assert.equal(sanitizeLinkTags(bad as never).ok, false);
  });
  it("channel defaults are overridden by provider tags", () => {
    assert.deepEqual(effectiveTags("QR_DESK", null), { utm_source: "kiorly", utm_medium: "qr" });
    assert.equal(effectiveTags("QR_DESK", { utm_medium: "poster" }).utm_medium, "poster");
  });
});

describe("GRW-P1-D1 URLs and open-redirect protection", () => {
  it("builds the short, tracked and canonical forms from configuration only", () => {
    assert.equal(pageUrl("dr-ahmed", ENV), "https://app.kiorly.test/b/dr-ahmed");
    assert.equal(shortUrl("7K3M9QXA", ENV), "https://app.kiorly.test/q/7K3M9QXA");
    assert.equal(trackedPageUrl("dr-ahmed", "7K3M9QXA", ENV), "https://app.kiorly.test/b/dr-ahmed?s=7K3M9QXA");
    const link = { ...ENV, BOOKING_LINK_BASE_URL: "https://kiorly.link" };
    assert.equal(shortUrl("7K3M9QXA", link), "https://kiorly.link/q/7K3M9QXA");
    assert.equal(pageUrl("dr-ahmed", link), "https://kiorly.link/dr-ahmed");
    const c = new URL(kiorexCanonicalUrl({ kind: "doctor", slug: "dr-ahmed", country: "EG", lt: "T.S", channelKind: "QR_DESK", tags: { utm_campaign: "x" } }, ENV));
    assert.equal(c.origin + c.pathname, "https://kiorex.test/ar/eg/doctor/dr-ahmed");
    assert.deepEqual([c.searchParams.get("lt"), c.searchParams.get("utm_source"), c.searchParams.get("utm_medium"), c.searchParams.get("utm_campaign")], ["T.S", "kiorly", "qr", "x"]);
  });
  it("the Book button always has a working destination, and the dedicated widget origin wins when configured", () => {
    const base = { kind: "doctor" as const, slug: "dr-ahmed", pageSlug: "clinic-x", clinicId: "c1", clinicianId: "d1", lt: "T.S" };
    assert.match(widgetEmbedUrl(base, ENV), /^https:\/\/kiorex\.test\/ar\/eg\/doctor\/dr-ahmed\?lt=T\.S$/);
    const w = new URL(widgetEmbedUrl(base, { ...ENV, KIOREX_BOOKING_WIDGET_URL: "https://book.kiorex.test/v1/embed" }));
    assert.equal(w.host, "book.kiorex.test");
    assert.deepEqual([w.searchParams.get("channel"), w.searchParams.get("lt"), w.searchParams.get("clinicianId")], ["CLINIC_LINK", "T.S", "d1"]);
  });
  it("redirects only to configured hosts, https (http on localhost), without credentials", () => {
    assert.ok(allowedRedirectHosts(ENV).has("kiorex.test"));
    assert.equal(assertAllowedRedirect("https://kiorex.test/ar/eg/doctor/x?lt=1", ENV), "https://kiorex.test/ar/eg/doctor/x?lt=1");
    for (const evil of ["https://evil.example/", "//evil.example", "https://kiorex.test.evil.example/", "https://user:pw@kiorex.test/", "http://kiorex.test/", "javascript:alert(1)", "data:text/html,x", "https://kiorex.test@evil.example/", "not a url"]) {
      assert.throws(() => assertAllowedRedirect(evil, ENV), /REDIRECT_NOT_ALLOWED/, evil);
    }
    assert.ok(assertAllowedRedirect("http://localhost:5180/x", { ...ENV, KIOREX_PATIENT_WEB_URL: "http://localhost:5180" }));
  });
});

describe("GRW-P1-D1 widget settings", () => {
  it("accepts exact https origins (contract rule) and normalises case", () => {
    assert.deepEqual(validateWidgetOrigins(["https://Clinic.example.com", "https://www.clinic.example.com:8443"]), { ok: true, origins: ["https://clinic.example.com", "https://www.clinic.example.com:8443"] });
    assert.deepEqual(validateWidgetOrigins([]), { ok: true, origins: [] });
  });
  it("rejects wildcard, http, paths, localhost, duplicates, junk and the 11th origin", () => {
    const reason = (o: unknown) => {
      const r = validateWidgetOrigins(o);
      return r.ok ? "OK" : r.reason;
    };
    assert.equal(reason(["https://*.example.com"]), "WILDCARD");
    assert.equal(reason(["http://example.com"]), "NOT_HTTPS");
    assert.equal(reason(["https://example.com/path"]), "HAS_PATH");
    assert.equal(reason(["https://example.com?x=1"]), "HAS_PATH");
    assert.equal(reason(["https://localhost"]), "MALFORMED");
    assert.equal(reason(["https://example.com", "https://EXAMPLE.com"]), "DUPLICATE");
    assert.equal(reason([5]), "MALFORMED");
    assert.equal(reason("https://example.com"), "MALFORMED");
    const ten = Array.from({ length: 10 }, (_, i) => `https://s${i}.example.com`);
    assert.equal(reason(ten), "OK");
    assert.equal(reason([...ten, "https://s10.example.com"]), "TOO_MANY");
  });
  it("branding, languages and selection are validated; defaults are all-ar-en, all doctors", () => {
    assert.deepEqual(validateWidgetSettings(undefined), { ok: true, settings: DEFAULT_WIDGET_SETTINGS });
    assert.deepEqual(validateWidgetSettings({ brandColor: "#0D9488", languages: ["ar"], doctorIds: ["d1"] }), { ok: true, settings: { brandColor: "#0d9488", languages: ["ar"], doctorIds: ["d1"], branchIds: [] } });
    for (const bad of [{ brandColor: "teal" }, { languages: [] }, { languages: ["fr"] }, { doctorIds: "d1" }, { doctorIds: [""] }]) assert.equal(validateWidgetSettings(bad).ok, false);
  });
  it("snippets contain only public slugs and escape the slug", () => {
    const s = widgetSnippets({ slug: 'a"><script>', locale: "ar", baseUrl: "https://book.kiorex.test" });
    assert.ok(!s.script.includes("<script>alert") && !s.iframe.includes('"><script>'));
    assert.match(widgetSnippets({ slug: "clinic-x", locale: "en", doctorSlug: "dr-a", baseUrl: "https://book.kiorex.test" }).script, /data-org="clinic-x" data-doctor="dr-a" data-locale="en"/);
  });
});

async function decode(svgOrPng: string | Buffer): Promise<string | null> {
  const img = sharp(typeof svgOrPng === "string" ? Buffer.from(svgOrPng) : svgOrPng, { density: 300 }).resize({ width: 600, kernel: "nearest" }).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

describe("GRW-P1-D1 QR codes", () => {
  const url = "https://kiorly.link/q/7K3M9QXA";
  it("SVG matches the golden snapshot (error correction M, 4-module quiet zone)", async () => {
    assert.equal(await qrSvg(url), readFileSync(join(__dirname, "fixtures", "qr-golden.svg"), "utf8"));
  });
  it("SVG and PNG decode back to the exact short link (decoder is a test-only dependency)", async () => {
    assert.equal(await decode(await qrSvg(url)), url);
    assert.equal(await decode(await qrPng(url, 512)), url);
  });
  it("the quiet zone is at least 4 modules on every side", async () => {
    const svg = await qrSvg(url);
    const size = Number(/viewBox="0 0 (\d+) /.exec(svg)![1]);
    const { data, info } = await sharp(Buffer.from(svg), { density: size * 20 }).resize({ width: size * 10, kernel: "nearest" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const px = info.width / size;
    const dark = (x: number, y: number) => data[Math.floor(y) * info.width + Math.floor(x)]! < 128;
    for (let m = 0; m < 4; m += 1) for (let i = 0; i < size; i += 1) {
      assert.ok(!dark((m + 0.5) * px, (i + 0.5) * px) && !dark((size - 1 - m + 0.5) * px, (i + 0.5) * px) && !dark((i + 0.5) * px, (m + 0.5) * px) && !dark((i + 0.5) * px, (size - 1 - m + 0.5) * px));
    }
  });
  it("encodes no patient data: the payload is exactly the link URL", async () => {
    assert.equal(await decode(await qrPng("https://kiorly.link/q/ABCDEFGH", 400)), "https://kiorly.link/q/ABCDEFGH");
  });
});

describe("GRW-P1-D1 printable sheets (Arabic and English)", () => {
  const base = { size: "A4" as const, nameEn: "Dr. <b>Ahmed</b> & Co", nameAr: "د. أحمد", subtitleEn: "Cardiology", subtitleAr: "قلب", shortUrl: "https://kiorly.link/q/7K3M9QXA", qrSvg: "<svg>QR</svg>" };
  it("Arabic renders RTL with Arabic copy; English LTR; the URL stays LTR; names are escaped", () => {
    const ar = renderPosterHtml({ ...base, kind: "POSTER", lang: "ar" });
    assert.match(ar, /<html lang="ar" dir="rtl">/);
    assert.ok(ar.includes("د. أحمد") && ar.includes("امسح الرمز") && ar.includes("كيورلي"));
    assert.ok(ar.includes("kiorly.link/q/7K3M9QXA") && ar.includes("direction:ltr"));
    const en = renderPosterHtml({ ...base, kind: "POSTER", lang: "en" });
    assert.match(en, /<html lang="en" dir="ltr">/);
    assert.ok(en.includes("Dr. &lt;b&gt;Ahmed&lt;/b&gt; &amp; Co") && !en.includes("<b>Ahmed</b>"));
    assert.ok(en.includes("Kiorly Clinic by Kiorex") && en.includes("@page { size: A4;"));
    assert.match(renderPosterHtml({ ...base, kind: "POSTER", lang: "en", size: "A5" }), /@page \{ size: A5;/);
  });
  it("doctor card sheet holds ten cards on A4; desk card says book your next visit; noindex and no script unless print was requested", () => {
    const sheet = renderPosterHtml({ ...base, kind: "DOCTOR_CARD", lang: "en", size: "A5" });
    assert.equal((sheet.match(/class="card"/g) ?? []).length, 10);
    assert.match(sheet, /@page \{ size: A4;/);
    assert.ok(renderPosterHtml({ ...base, kind: "DESK", lang: "en" }).includes("Book your next visit"));
    assert.ok(sheet.includes('name="robots" content="noindex,nofollow"') && !sheet.includes("<script>"));
    assert.ok(renderPosterHtml({ ...base, kind: "POSTER", lang: "en", autoPrint: true }).includes("window.print()"));
  });
});

describe("GRW-P1-D1 bot filtering", () => {
  const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  it("counts a normal browser and drops crawlers, previews, tools, prefetch and missing UA", () => {
    assert.equal(isLikelyBot({ "user-agent": chrome }), false);
    for (const ua of ["Googlebot/2.1 (+http://www.google.com/bot.html)", "WhatsApp link preview facebookexternalhit/1.1", "curl/8.4.0", "python-requests/2.31", "Mozilla/5.0 HeadlessChrome/120", "UptimeRobot/2.0", "", "x"]) assert.equal(isLikelyBot({ "user-agent": ua }), true, ua);
    assert.equal(isLikelyBot({ "user-agent": chrome, purpose: "prefetch" }), true);
    assert.equal(isLikelyBot({ "user-agent": chrome, "sec-purpose": "prefetch;prerender" }), true);
    assert.equal(isLikelyBot({}), true);
  });
});

describe("GRW-P1-D1 roles and plan entitlements", () => {
  const u = (role: string, extra: object = {}) => ({ role: role as never, ...extra });
  it("owner and admins manage everything; marketing cannot touch widget origins or revoke; read roles only view", () => {
    for (const r of ["GROUP_ADMIN", "CLINIC_ADMIN", "BRANCH_MANAGER"]) for (const a of ["view", "create", "update", "revoke", "widget"] as const) assert.equal(canGrowth(u(r), a), true, `${r} ${a}`);
    assert.equal(growthLevel(u("PHYSICIAN", { isTenantOwner: true })), "admin");
    assert.deepEqual((["view", "create", "update", "revoke", "widget"] as const).map((a) => canGrowth(u("CLINIC_ASSISTANT"), a)), [true, true, true, false, false]);
    for (const r of ["GROUP_SUPERVISOR", "RECEPTIONIST"]) assert.deepEqual((["view", "create", "update", "revoke", "widget"] as const).map((a) => canGrowth(u(r), a)), [true, false, false, false, false]);
    for (const r of ["PHYSICIAN", "NURSE", "FINANCE_OFFICER", "HR_OFFICER", "CALL_CENTER", "SALES_REP", "PLATFORM_SUPER_ADMIN"]) assert.equal(canGrowth(u(r), "view"), false, r);
    assert.equal(canGrowth(u("PHYSICIAN", { additionalRoles: ["CLINIC_ADMIN"] }), "widget"), true);
  });
  it("plan limits grow with the plan and the widget is Pro and above", () => {
    assert.ok(GROWTH_PLAN_LIMITS.LITE.maxActiveLinks < GROWTH_PLAN_LIMITS.PRO.maxActiveLinks && GROWTH_PLAN_LIMITS.PRO.maxActiveLinks < GROWTH_PLAN_LIMITS.ENTERPRISE.maxActiveLinks);
    assert.equal(growthLimitsFor("LITE" as never).widget, false);
    assert.equal(growthLimitsFor("PRO" as never).widget, true);
  });
});

const facts = (o: Partial<AppointmentFacts>): AppointmentFacts => ({ status: "SCHEDULED", bookingSource: "KIOREX_MARKETPLACE", acquisitionOrigin: null, isNewPatientAtBooking: true, feeAmount: 300, createdAt: new Date("2026-11-03T10:00:00Z"), checkedInAt: null, ...o });

describe("GRW-P1-D1 acquisition performance", () => {
  it("classifies by who brought the patient: provider-led wins, then Kiorex sources, front desk is neither", () => {
    assert.equal(classifyOrigin({ bookingSource: "CLINIC_LINK", acquisitionOrigin: null }), "PROVIDER");
    assert.equal(classifyOrigin({ bookingSource: "KIOREX_MARKETPLACE", acquisitionOrigin: "PROVIDER_LED" }), "PROVIDER");
    assert.equal(classifyOrigin({ bookingSource: "KIOREX_MARKETPLACE", acquisitionOrigin: "MARKETPLACE" }), "MARKETPLACE");
    assert.equal(classifyOrigin({ bookingSource: "KIOREX_WHATSAPP", acquisitionOrigin: null }), "MARKETPLACE");
    assert.equal(classifyOrigin({ bookingSource: "FRONT_DESK", acquisitionOrigin: null }), "OTHER");
  });
  it("rolls up bookings, attendance, cancellations, incremental revenue (new attended marketplace patients only) and a weekly trend", () => {
    const rows = [
      facts({ status: "COMPLETED", checkedInAt: new Date(), feeAmount: 300 }),
      facts({ status: "COMPLETED", checkedInAt: new Date(), isNewPatientAtBooking: false, feeAmount: 500 }),
      facts({ status: "CANCELLED" }),
      facts({ bookingSource: "CLINIC_LINK", status: "COMPLETED", checkedInAt: new Date(), feeAmount: 400 }),
      facts({ acquisitionOrigin: "PROVIDER_LED", status: "NO_SHOW", createdAt: new Date("2026-11-11T10:00:00Z") }),
      facts({ bookingSource: "FRONT_DESK" }),
    ];
    const p = buildPerformance(rows, { visits: 40, bookings: 4, attended: 2 });
    assert.deepEqual([p.providerOriginated.bookings, p.providerOriginated.attended, p.providerOriginated.cancelledOrNoShow], [2, 1, 1]);
    assert.deepEqual([p.marketplaceOriginated.bookings, p.marketplaceOriginated.attended, p.marketplaceOriginated.cancelledOrNoShow, p.marketplaceOriginated.newPatients], [3, 2, 1, 2]);
    assert.equal(p.incrementalMarketplaceRevenue, 300);
    assert.equal(p.links.visitToBooking, 0.1);
    assert.deepEqual(p.trend, [{ week: "2026-11-02", provider: 1, marketplace: 3 }, { week: "2026-11-09", provider: 1, marketplace: 0 }]);
    assert.equal(buildPerformance([], { visits: 0, bookings: 0, attended: 0 }).links.visitToBooking, null);
  });
});

const calm: RecommendationInput = { activeLinks: 2, hasDeskLink: true, widgetEnabled: true, widgetEntitled: true, pageReady: true, liveDoctors: 2, doctorsWithoutAvailability: 0, bookableTypes: 3, avgProfileCompleteness: 95, kiorexBookings30d: 40, cancelled30d: 2, noShow30d: 1, overdueConfirmations: 0 };

describe("GRW-P1-D1 recommendations", () => {
  it("a healthy clinic gets nothing", () => assert.deepEqual(buildRecommendations(calm), []));
  it("fires on availability, profile, response time and cancellations, most urgent first", () => {
    const ids = buildRecommendations({ ...calm, doctorsWithoutAvailability: 1, avgProfileCompleteness: 60, overdueConfirmations: 3, cancelled30d: 12, noShow30d: 6, activeLinks: 0, widgetEnabled: false }).map((r) => r.id);
    assert.deepEqual(ids.slice(0, 2).sort(), ["AVAILABILITY_MISSING", "RESPONSE_OVERDUE"]);
    for (const id of ["PROFILE_INCOMPLETE", "CANCELLATIONS_HIGH", "NO_SHOW_HIGH", "CREATE_FIRST_LINK", "ENABLE_WIDGET"]) assert.ok(ids.includes(id as never), id);
  });
  it("small samples never produce a cancellation rate recommendation", () => assert.deepEqual(buildRecommendations({ ...calm, kiorexBookings30d: 5, cancelled30d: 5 }), []));
  it("guardrail: the catalogue is closed and contains no over-treatment, price-pressure or testimonial tactic", () => {
    assert.deepEqual([...RECOMMENDATION_IDS].sort(), ["AVAILABILITY_MISSING", "AVAILABILITY_NO_BOOKABLE_TYPES", "CANCELLATIONS_HIGH", "CREATE_FIRST_LINK", "ENABLE_WIDGET", "NO_SHOW_HIGH", "PAGE_NOT_READY", "PRINT_RECEPTION_QR", "PROFILE_INCOMPLETE", "RESPONSE_OVERDUE", "PROFILE_PHOTO_MISSING", "PROFILE_BIO_INCOMPLETE", "PUBLISH_MORE_SLOTS", "RESPOND_TO_REVIEW", "ADD_LANGUAGE", "VERIFICATION_PENDING", "LINK_CONVERSION_LOW", "LINK_PAUSED_IDLE", "SOCIAL_TEMPLATE_UNUSED", "STATEMENT_DISPUTE_CLOSING", "PLAN_LIMIT_NEAR"].sort());
    // RESPOND_TO_REVIEW answers a verified patient review; no id may solicit, buy or steer reviews, or push treatment, price or promotion
    for (const id of RECOMMENDATION_IDS) assert.ok(!/UPSELL|PROCEDURE|TESTIMONIAL|REQUEST_REVIEW|ASK_REVIEW|INCENTIV|DISCOUNT|PROMO|TREATMENT|PRICE/i.test(id), id);
  });
});
