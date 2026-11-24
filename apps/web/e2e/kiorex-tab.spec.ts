import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { login } from "./helpers";

/**
 * The Kiorex tab is a state-aware front door (ADR-040). The five states are driven by mocking the two state endpoints on top of a real owner session
 * (the backend flows are covered by e2e/test/24-kiorex-front-door.e2e.ts in the workspace repo). LIVE is also checked against the real seeded organisation.
 */
const SHOTS = process.env.KIOREX_TAB_SHOTS_DIR;
const shot = async (page: Page, name: string) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, `clinic-${name}.png`), fullPage: true }); };
const STEPS = ["subscription", "entitlement", "credentials", "appointment_types", "availability", "profile", "consent", "options", "request", "live"];
const steps = (done: number, extra: Record<string, string> = {}) => STEPS.map((key, i) => ({ key, status: extra[key] ?? (i < done ? "done" : i === done ? "action_needed" : "blocked"), ...(key === "options" ? { optional: true } : {}) }));
const connect = (status: string, o: Record<string, unknown> = {}) => ({ clinicId: "c1", tenantId: "t1", legacy: false, status, edition: "CLINIC", market: "EG", progress: 40, canRequest: false, steps: steps(4), doctors: [{ listingId: "l1", clinicianId: "u1", name: "Dr Test", verification: "VERIFIED", hasAvailability: true, profilePercent: 90, profileMissing: [], status: "DRAFT", pausedReason: null, ready: true }], kiorex: null, requestId: null, consent: null, termsVersion: "2026-11", feeCard: null, ...o });
const door = (state: string, status: string, o: Record<string, unknown> = {}) => ({ clinicId: "c1", state, status, legacy: false, started: state !== "NOT_CONNECTED", interestedAt: null, leadAt: null, recent: [], ...o });

async function mockState(page: Page, d: Record<string, unknown>, c: Record<string, unknown>, extra?: (url: URL) => unknown) {
  await page.route(/\/api\/v1\/kiorex\/front-door(\?.*)?$/, (r) => (r.request().method() === "GET" ? r.fulfill({ json: d }) : r.fulfill({ json: { sent: true } })));
  await page.route(/\/api\/v1\/kiorex\/connect(\?.*)?$/, (r) => r.fulfill({ json: c }));
  await page.route(/\/api\/v1\/kiorex\/front-door\/(interest|start)$/, (r) => r.fulfill({ json: d }));
  void extra;
}
const open = async (page: Page, lang: "en" | "ar" = "en") => {
  await page.evaluate((l) => { document.cookie = `cms_locale=${l}; Path=/`; localStorage.setItem("cms_locale", l); }, lang);
  await page.goto("/kiorex");
  await expect(page.getByTestId("kiorex-state")).toBeVisible({ timeout: 60_000 });
};
const axe = async (page: Page) => { const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]); };
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

test.describe("Kiorex tab states (clinic)", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/login"); await login(page, "admin@kiorly.com"); });

  test("1 not connected: landing with true benefits, how it works, live readiness, reassurance, fee from the schedule, Start and Talk to us", async ({ page }) => {
    await mockState(page, door("NOT_CONNECTED", "STANDALONE"), connect("STANDALONE", { feeCard: { currency: "EGP", rates: [{ specialty: null, feeType: "FLAT", amount: "50.00", percent: null }] } }));
    await open(page);
    await expect(page.getByTestId("kiorex-state")).toHaveAttribute("data-state", "NOT_CONNECTED");
    await expect(page.getByRole("heading", { name: "Reach more patients with Kiorex" })).toBeVisible();
    for (const k of ["search", "deposits", "reviews", "calendar", "whatsapp", "option_CLINIC"]) await expect(page.getByTestId(`benefit-${k}`)).toBeVisible();
    await expect(page.getByTestId("landing-how").locator("li")).toHaveCount(4);
    await expect(page.getByTestId("landing-readiness-count")).toHaveText("4 of 8 steps already done");
    await expect(page.getByTestId("readiness-credentials")).toHaveAttribute("data-status", "done");
    await expect(page.getByTestId("readiness-availability")).toHaveAttribute("data-status", "action_needed");
    await expect(page.getByTestId("landing-reassure")).toContainText("reversible");
    await expect(page.getByTestId("landing-fee")).toContainText("EGP 50"); // only from the published schedule
    await expect(page.getByTestId("landing-start")).toBeVisible(); await expect(page.getByTestId("landing-talk")).toBeVisible();
    await expect(page.getByTestId("settings-card")).toHaveCount(0);
    await shot(page, "1-not-connected-1440"); await axe(page);
  });

  test("1b no schedule published: the page says the fees are confirmed by the Kiorex team (nothing invented)", async ({ page }) => {
    await mockState(page, door("NOT_CONNECTED", "STANDALONE"), connect("STANDALONE", { feeCard: null }));
    await open(page);
    await expect(page.getByTestId("landing-fee")).toContainText("confirmed by the Kiorex team");
    await expect(page.getByTestId("landing-fee")).not.toContainText(/\d/);
  });

  test("1c Talk to us: inline form, consent and a contact are required, the payload carries the form, no pop-up", async ({ page }) => {
    await mockState(page, door("NOT_CONNECTED", "STANDALONE"), connect("STANDALONE"));
    let sent: Record<string, unknown> | undefined;
    await page.route(/\/api\/v1\/kiorex\/front-door\/talk$/, async (r) => { sent = r.request().postDataJSON(); await r.fulfill({ json: door("NOT_CONNECTED", "STANDALONE", { leadAt: new Date().toISOString() }) }); });
    await open(page);
    await page.getByTestId("landing-talk").click();
    await expect(page.getByTestId("talk-form")).toBeVisible(); await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("talk-name")).not.toHaveValue("");           // prefilled from the signed-in user
    await expect(page.getByTestId("talk-send")).toBeDisabled();                 // no consent, no phone or e-mail yet (e-mail is prefilled: consent still missing)
    await page.getByTestId("talk-phone").fill("+201000000123"); await page.getByTestId("talk-time").selectOption("EVENING"); await page.getByTestId("talk-note").fill("Please call after clinic");
    await expect(page.getByTestId("talk-send")).toBeDisabled();
    await page.getByTestId("talk-consent").check(); await expect(page.getByTestId("talk-send")).toBeEnabled();
    await shot(page, "1-talk-form"); await axe(page);
    await page.getByTestId("talk-send").click();
    await expect(page.getByTestId("landing-lead-sent")).toBeVisible();
    expect(sent).toMatchObject({ clinicId: expect.any(String), phone: "+201000000123", preferredTime: "EVENING", note: "Please call after clinic", consent: true });
  });

  test("2 in progress: progress bar and the next step highlighted, checklist states", async ({ page }) => {
    await mockState(page, door("IN_PROGRESS", "STANDALONE"), connect("STANDALONE", { progress: 44, steps: steps(4) }));
    await open(page);
    await expect(page.getByTestId("kiorex-state")).toHaveAttribute("data-state", "IN_PROGRESS");
    await expect(page.getByTestId("kiorex-progress")).toHaveAttribute("aria-valuenow", "44");
    await expect(page.getByTestId("next-step")).toHaveAttribute("data-step", "availability");
    await expect(page.getByTestId("panel-step-subscription")).toHaveAttribute("data-status", "done");
    await expect(page.getByTestId("panel-open-wizard")).toHaveAttribute("href", "/kiorex/connect");
    await shot(page, "2-in-progress-1440"); await axe(page);
  });

  test("3 waiting for Kiorex review: clear status and what happens next", async ({ page }) => {
    await mockState(page, door("WAITING", "REQUESTED"), connect("REQUESTED", { progress: 89, steps: steps(8, { request: "waiting_kiorex", live: "blocked" }) }));
    await open(page);
    await expect(page.getByTestId("waiting-card")).toContainText("Kiorex is reviewing your request");
    await expect(page.getByTestId("waiting-card").locator("li")).toHaveCount(3);
    await shot(page, "3-waiting-1440"); await axe(page);
  });

  for (const [status, decision] of [["CHANGES_REQUESTED", "Kiorex asked for changes"], ["REJECTED", "Your request was not approved"], ["PAUSED", "Your Kiorex listing is paused"]] as const) {
    test(`5 attention (${status}): decision banner and what is missing`, async ({ page }) => {
      await mockState(page, door("ATTENTION", status), connect(status, { progress: 70, steps: steps(6, { availability: "action_needed" }) }));
      await page.route(/\/api\/v1\/kiorex\/settings/, (r) => r.fulfill({ status: 403, json: { message: "no" } }));
      await open(page);
      await expect(page.getByTestId("connect-decision")).toContainText(decision);
      if (status !== "PAUSED") await expect(page.getByTestId("attention-missing")).toContainText("Availability");
      await shot(page, `5-attention-${status.toLowerCase()}-1440`); await axe(page);
    });
  }

  test("4 live: the real dashboard of the seeded connected organisation (bookings, fees, rating, listings, recent, settings link)", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("kiorex-state")).toHaveAttribute("data-state", "LIVE");
    await expect(page.getByTestId("kiorex-live-dashboard")).toBeVisible({ timeout: 60_000 });
    for (const id of ["live-bookings", "live-fees", "live-rating", "live-listing-count", "live-recent"]) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId("live-settings")).toHaveAttribute("href", "/kiorex/connect");
    await expect(page.getByTestId("kiorex-performance-card")).toBeVisible();   // the day-to-day cards stay below the dashboard
    await shot(page, "4-live-1440"); await axe(page);
  });

  test("4b live (mocked): per-doctor pause and resume, Passport prompt, recent bookings without patient names", async ({ page }) => {
    const live = connect("APPROVED", { progress: 100, steps: steps(10), doctors: [{ listingId: "l1", clinicianId: "u1", name: "Dr Live", verification: "VERIFIED", hasAvailability: true, profilePercent: 90, profileMissing: [], status: "LIVE", pausedReason: null, ready: true }, { listingId: "l2", clinicianId: "u2", name: "Dr Paused", verification: "VERIFIED", hasAvailability: true, profilePercent: 90, profileMissing: [], status: "PAUSED", pausedReason: "owner", ready: true }] });
    await mockState(page, door("LIVE", "APPROVED", { recent: [{ id: "a1", startsAt: new Date().toISOString(), status: "CONFIRMED", channel: "marketplace", clinicianName: "Dr Live" }] }), live);
    const calls: string[] = []; await page.route(/\/api\/v1\/marketplace\/listings\/[^/]+\/pause/, (r) => { calls.push(r.request().url()); return r.fulfill({ json: {} }); });
    await open(page);
    await expect(page.getByTestId("live-listing-l1")).toHaveAttribute("data-status", "LIVE");
    await page.getByTestId("live-pause-l1").click(); await page.getByTestId("live-resume-l2").click();
    await expect.poll(() => calls.length).toBe(2); expect(calls[0]).toContain("/l1/pause?paused=true"); expect(calls[1]).toContain("/l2/pause?paused=false");
    await expect(page.getByTestId("live-recent")).toContainText("Dr Live");
    await shot(page, "4-live-mocked-1440"); await axe(page);
  });

  for (const w of [360, 768, 1024, 1440, 2560]) {
    test(`responsive ${w}px: landing has no horizontal overflow and passes axe`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await mockState(page, door("NOT_CONNECTED", "STANDALONE"), connect("STANDALONE"));
      await open(page); await noOverflow(page);
      if (w === 360 || w === 2560) await shot(page, `1-not-connected-${w}`);
      await axe(page);
    });
  }

  for (const state of ["NOT_CONNECTED", "LIVE"] as const) for (const theme of ["light", "dark"] as const) {
    test(`Arabic RTL ${theme}: ${state}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      if (state === "NOT_CONNECTED") await mockState(page, door("NOT_CONNECTED", "STANDALONE"), connect("STANDALONE"));
      if (theme === "dark") await page.addInitScript(() => { try { localStorage.setItem("cms-theme", "dark"); } catch { /* ignore */ } });
      await open(page, "ar");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      if (state === "NOT_CONNECTED") await expect(page.getByRole("heading", { name: "اوصل إلى مرضى أكثر مع كيوريكس" })).toBeVisible();
      await noOverflow(page); await shot(page, `${state.toLowerCase()}-ar-${theme}`); await axe(page);
    });
  }
});

test.describe("Kiorex home card (standalone only, dismissible, per user)", () => {
  test("shows on the home dashboard, dismiss is remembered, returns only on request from the Kiorex tab; connected organisations never see it", async ({ page }) => {
    await page.goto("/login"); await login(page, "admin@kiorly.com");
    await mockState(page, door("NOT_CONNECTED", "STANDALONE"), connect("STANDALONE"));
    await page.goto("/");
    await expect(page.getByTestId("kiorex-home-card")).toBeVisible({ timeout: 60_000 }); await shot(page, "home-card"); await axe(page);
    await page.getByTestId("home-card-dismiss").click(); await expect(page.getByTestId("kiorex-home-card")).toHaveCount(0);
    await page.reload(); await page.waitForLoadState("networkidle"); await expect(page.getByTestId("kiorex-home-card")).toHaveCount(0);
    await page.goto("/kiorex"); await page.getByTestId("home-card-show").click();
    await page.goto("/"); await expect(page.getByTestId("kiorex-home-card")).toBeVisible();
    await page.unroute(/\/api\/v1\/kiorex\/front-door(\?.*)?$/); await page.route(/\/api\/v1\/kiorex\/front-door(\?.*)?$/, (r) => r.fulfill({ json: door("LIVE", "APPROVED") }));
    await page.reload(); await page.waitForLoadState("networkidle"); await expect(page.getByTestId("kiorex-home-card")).toHaveCount(0);
  });
});
