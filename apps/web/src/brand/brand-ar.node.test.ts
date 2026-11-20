// Arabic lockup + footer accent rules (same file vendored in all three web apps; the product comes from KIORLY_PRODUCT).
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import { KiorexLogo, langOf } from "./components";
import { buildScene, PALETTE, PRODUCT_NAMES_AR } from "./components/shared/logo-scene";
import { footSegments } from "./components/shared/foot-text";
import { KIORLY_PRODUCT, KiorlyBrand, KiorlyFootText } from "./ui-kit";

// ui-kit.tsx uses the classic JSX runtime under tsx (no tsconfig jsx setting for the node test runner)
(globalThis as { React?: typeof React }).React = React;

const P = KIORLY_PRODUCT;
const AR_NAME = { clinic: "كيورلي للعيادات من كيوريكس", lab: "كيورلي لاب من كيوريكس", pharmacy: "كيورلي للصيدليات من كيوريكس" }[P];
const AR_WORD = { clinic: "للعيادات", lab: "لاب", pharmacy: "للصيدليات" }[P];
const EN_WORD = { clinic: "Clinic", lab: "Lab", pharmacy: "Pharmacy" }[P];
const ACCENT = PALETTE.color[P];
const tx = (t: string) => Number(/translate\(([-\d.]+)/.exec(t)![1]);

test("langOf selects Arabic for ar and ar-* only", () => {
  assert.equal(langOf("ar"), "ar"); assert.equal(langOf("ar-EG"), "ar"); assert.equal(langOf("en"), "en"); assert.equal(langOf(undefined), "en"); assert.equal(langOf("fr"), "en");
});

test("Arabic scene: ي + the whole product word use the accent, the rest of كيورلي is indigo, 'من كيوريكس' is muted, mark sits on the right", () => {
  const sc = buildScene("lockup", P, "ar");
  const glyphs = sc.nodes.filter((n) => n.k === "glyph") as Extract<(typeof sc.nodes)[number], { k: "glyph" }>[];
  assert.equal(glyphs.filter((g) => g.role === "indigo").length, 5, "K-I-O-R-L");
  assert.ok(glyphs.filter((g) => g.role === P).length > 1, "ي + product word glyphs");
  assert.ok(glyphs.some((g) => g.role === "sub"), "من كيوريكس muted");
  // the mark (chevrons) is right of every glyph and of the rule
  const rule = sc.nodes.find((n) => n.k === "line") as { x1: number };
  const maxGlyphX = Math.max(...glyphs.map((g) => tx(g.transform)));
  assert.ok(maxGlyphX < rule.x1, "words are left of the rule (RTL: mark on the start/right side)");
  const poly = sc.nodes.filter((n) => n.k === "poly") as { points: string }[];
  assert.ok(poly.every((p) => Number(p.points.split(",")[0]) > rule.x1), "chevrons right of the rule");
  // right chevron keeps the product accent, left stays indigo (artwork unchanged)
  assert.deepEqual(poly.map((p) => (p as unknown as { role: string }).role), ["indigo", P]);
});

test("Latin scene is unchanged by the lang parameter", () => {
  assert.deepEqual(buildScene("lockup", P), buildScene("lockup", P, "en"));
  assert.equal(buildScene("lockup", "kiorex", "ar").nodes.length, buildScene("lockup", "kiorex").nodes.length, "no Arabic wordmark for Kiorex/Passport/Nurse yet");
});

test("KiorexLogo renders the Arabic lockup with an Arabic accessible name", () => {
  const ar = renderToStaticMarkup(createElement(KiorexLogo, { variant: "lockup", product: P, lang: "ar-EG", height: 40 }));
  assert.match(ar, new RegExp(`aria-label="${AR_NAME}"`)); assert.match(ar, /lang="ar"/);
  assert.ok(ar.includes(`fill="${ACCENT}"`) && ar.includes(`fill="${PALETTE.color.indigo}"`));
  const en = renderToStaticMarkup(createElement(KiorexLogo, { variant: "lockup", product: P, height: 40 }));
  assert.match(en, new RegExp(`aria-label="Kiorly ${EN_WORD} by Kiorex"`)); assert.doesNotMatch(en, /lang="ar"/);
  assert.equal(PRODUCT_NAMES_AR[P], AR_NAME);
});

test("footSegments: Latin = Y + product word accent", () => {
  assert.deepEqual(footSegments(`Kiorly ${EN_WORD} by Kiorex`, EN_WORD), [
    { text: "Kiorl", kind: "brand" }, { text: "y", kind: "last" }, { text: " " }, { text: EN_WORD, kind: "word" }, { text: " by Kiorex" },
  ]);
});

test("footSegments: Arabic = ي + product word accent", () => {
  assert.deepEqual(footSegments(AR_NAME, AR_WORD), [
    { text: "كيورل", kind: "brand" }, { text: "ي", kind: "last" }, { text: " " }, { text: AR_WORD, kind: "word" }, { text: " من كيوريكس" },
  ]);
});

test("KiorlyFootText renders accent spans; the ي span changes colour only (keeps Arabic joining)", () => {
  const html = renderToStaticMarkup(createElement(KiorlyFootText, { text: AR_NAME, word: AR_WORD }));
  assert.match(html, /font-feature-settings:&quot;rlig&quot; 0/);
  assert.match(html, /<span data-kx-accent="last" style="color:#[0-9A-Fa-f]{6}">ي<\/span>/);
  assert.match(html, new RegExp(`<span data-kx-accent="word" style="color:#[0-9A-Fa-f]{6};font-weight:600">${AR_WORD}</span>`));
  const en = renderToStaticMarkup(createElement(KiorlyFootText, { text: `Kiorly ${EN_WORD} by Kiorex`, word: EN_WORD }));
  assert.match(en, /data-kx-accent="last"[^>]*>y</); assert.match(en, new RegExp(`data-kx-accent="word"[^>]*>${EN_WORD}<`));
});

test("KiorlyBrand follows the UI language (Arabic wordmark when ar)", async () => {
  const inst = i18next.createInstance();
  await inst.init({ lng: "ar", resources: {}, interpolation: { escapeValue: false } });
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n: inst }, createElement(KiorlyBrand, { height: 30 })));
  assert.ok(html.includes(`aria-label="${AR_NAME}"`));
  await inst.changeLanguage("en");
  const en = renderToStaticMarkup(createElement(I18nextProvider, { i18n: inst }, createElement(KiorlyBrand, { height: 30 })));
  assert.ok(en.includes(`aria-label="Kiorly ${EN_WORD} by Kiorex"`));
});
