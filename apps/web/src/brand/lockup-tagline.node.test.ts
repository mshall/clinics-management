// Every product shows "Kiorly <Product> by Kiorex" with its management tagline beneath, in both languages (same file in all three web apps).
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import { KIORLY_PRODUCT, KiorlyBrandLockup, LanguageToggle } from "./ui-kit";

(globalThis as { React?: typeof React }).React = React;
const P = KIORLY_PRODUCT;
const TAG = { clinic: ["Clinic Management", "إدارة العيادات"], pharmacy: ["Pharmacy Management", "إدارة الصيدليات"], lab: ["Laboratory Management", "إدارة المختبرات"] }[P];
const NAME = { clinic: ["Kiorly Clinic by Kiorex", "كيورلي للعيادات من كيوريكس"], pharmacy: ["Kiorly Pharmacy by Kiorex", "كيورلي للصيدليات من كيوريكس"], lab: ["Kiorly Lab by Kiorex", "كيورلي لاب من كيوريكس"] }[P];
const loc = (l: string) => JSON.parse(readFileSync(new URL(`../locales/${l}.json`, import.meta.url), "utf8"));

async function render(lng: "en" | "ar", node: React.ReactElement) {
  const inst = i18next.createInstance();
  await inst.init({ lng, resources: { en: { translation: loc("en") }, ar: { translation: loc("ar") } }, interpolation: { escapeValue: false } });
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: inst }, node));
}

test("locale keys: app.tagline and docTitle per product, both languages", () => {
  [["en", 0], ["ar", 1]].forEach(([l, i]) => {
    const d = loc(l as string);
    assert.equal(d.app.tagline, TAG[i as number]); assert.equal(d.app.docTitle, NAME[i as number]);
    assert.ok(d.lang.label && d.lang.english && d.lang.arabic && d.theme.system && d.theme.label);
  });
});

test("lockup renders the product lockup and the tagline beneath it (en + ar), and nothing generic", async () => {
  for (const [lng, i] of [["en", 0], ["ar", 1]] as const) {
    const html = await render(lng, createElement(KiorlyBrandLockup, { height: 40 }));
    assert.match(html, new RegExp(`aria-label="${NAME[i]}"`));
    assert.ok(html.indexOf("<svg") < html.indexOf("data-kx-tagline"), "tagline sits below the logo");
    assert.match(html, new RegExp(`data-kx-tagline[^>]*>${TAG[i]}<`));
  }
  const bare = await render("en", createElement(KiorlyBrandLockup, { tagline: false }));
  assert.doesNotMatch(bare, /data-kx-tagline/);
});

test("language toggle in ui-kit is localised and shows the current code", async () => {
  assert.match(await render("en", createElement(LanguageToggle, { onChange: () => {} })), /aria-label="Language: EN · Arabic"/);
  assert.match(await render("ar", createElement(LanguageToggle, { onChange: () => {} })), /AR/);
});
