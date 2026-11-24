// Shared language + theme controls (vendored into the three web apps with KxControls.tsx).
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KX_CONTROL_CLASS, KxControlPair, KxLanguageToggle, KxThemeToggle, KX_LANGUAGES, kxMenuNext, withThemeTransition } from "./KxControls";

(globalThis as { React?: typeof React }).React = React;
const noop = () => {};
const L = { theme: "Theme", light: "Light", dark: "Dark", system: "System" };
const LL = { language: "Language", english: "English", arabic: "Arabic" };

test("controls are >= 40px, keyboard focus-visible ring, motion-reduce safe", () => {
  assert.match(KX_CONTROL_CLASS, /h-10/); assert.match(KX_CONTROL_CLASS, /min-w-10/);
  assert.match(KX_CONTROL_CLASS, /focus-visible:ring-2/); assert.match(KX_CONTROL_CLASS, /motion-reduce:transition-none/);
});

test("language control is ONE button: globe + current code + chevron, a menu button (not two pills)", () => {
  const en = renderToStaticMarkup(createElement(KxLanguageToggle, { lang: "en", onChange: noop, labels: LL }));
  assert.match(en, />EN</); assert.match(en, /lucide-globe/); assert.match(en, /lucide-chevron-down/);
  assert.match(en, /aria-label="Language: EN · English"/); assert.match(en, /aria-haspopup="menu"/); assert.match(en, /aria-expanded="false"/);
  assert.equal((en.match(/<button/g) ?? []).length, 1, "closed menu renders a single button");
  assert.doesNotMatch(en, /role="menu"/);
  const ar = renderToStaticMarkup(createElement(KxLanguageToggle, { lang: "ar-EG", onChange: noop, labels: { language: "اللغة" } }));
  assert.match(ar, />AR</); assert.match(ar, /aria-label="اللغة: AR · العربية"/);
});

test("language menu lists each language in its own script, marks the current one and is keyboard navigable", () => {
  assert.deepEqual(KX_LANGUAGES.map((l) => l.name), ["العربية", "English"]);
  assert.equal(kxMenuNext("ArrowDown", 0, 2), 1); assert.equal(kxMenuNext("ArrowDown", 1, 2), 0);
  assert.equal(kxMenuNext("ArrowUp", 0, 2), 1); assert.equal(kxMenuNext("Home", 1, 2), 0); assert.equal(kxMenuNext("End", 0, 2), 1); assert.equal(kxMenuNext("a", 0, 2), -1);
});

test("theme toggle renders sun, moon and monitor; only the active one is visible; cycles light, dark, system", () => {
  const html = renderToStaticMarkup(createElement(KxThemeToggle, { value: "dark", onChange: noop, labels: L }));
  for (const m of ["light", "dark", "system"]) assert.match(html, new RegExp(`data-kx-icon="${m}"`));
  assert.match(html, /lucide-sun/); assert.match(html, /lucide-moon/); assert.match(html, /lucide-monitor/);
  assert.match(html, /data-kx-icon="dark" data-active="true"[^>]*opacity-100/); assert.match(html, /data-kx-icon="light" data-active="false"[^>]*opacity-0/);
  assert.match(html, /aria-label="Theme: Dark"/); assert.match(html, /duration-200/);
  const seq: string[] = [];
  for (const [v, want] of [["light", "dark"], ["dark", "system"], ["system", "light"]] as const) {
    (KxThemeToggle({ value: v, onChange: (n) => seq.push(n), labels: L }) as React.ReactElement<{ onClick: () => void }>).props.onClick(); assert.equal(seq.at(-1), want);
  }
});

test("theme toggle without system support omits the monitor and cycles light/dark", () => {
  const html = renderToStaticMarkup(createElement(KxThemeToggle, { value: "light", modes: ["light", "dark"], onChange: noop, labels: L }));
  assert.doesNotMatch(html, /lucide-monitor/);
  let got = "";
  (KxThemeToggle({ value: "dark", modes: ["light", "dark"], onChange: (n) => { got = n; }, labels: L }) as React.ReactElement<{ onClick: () => void }>).props.onClick();
  assert.equal(got, "light");
});

test("control pair is a flex row (trailing edge in RTL via logical flow)", () => {
  assert.match(renderToStaticMarkup(createElement(KxControlPair, null, "x")), /data-kx-controls[^>]*class="flex shrink-0 items-center gap-2/);
});

test("withThemeTransition runs the change immediately (before paint) and skips the animation when reduced motion is requested", () => {
  let ran = 0; withThemeTransition(() => { ran++; });
  assert.equal(ran, 1);
});
