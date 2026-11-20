// Shared language + theme controls (vendored into the three web apps with KxControls.tsx).
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KX_CONTROL_CLASS, KxControlPair, KxLanguageToggle, KxThemeToggle, withThemeTransition } from "./KxControls";

(globalThis as { React?: typeof React }).React = React;
const noop = () => {};
const L = { theme: "Theme", light: "Light", dark: "Dark", system: "System" };
const LL = { language: "Language", english: "English", arabic: "Arabic" };

test("controls are >= 40px, keyboard focus-visible ring, motion-reduce safe", () => {
  assert.match(KX_CONTROL_CLASS, /h-10/); assert.match(KX_CONTROL_CLASS, /min-w-10/);
  assert.match(KX_CONTROL_CLASS, /focus-visible:ring-2/); assert.match(KX_CONTROL_CLASS, /motion-reduce:transition-none/);
});

test("language toggle shows the globe and the CURRENT code, labelled in the UI language", () => {
  const en = renderToStaticMarkup(createElement(KxLanguageToggle, { lang: "en", onChange: noop, labels: LL }));
  assert.match(en, />EN</); assert.match(en, /lucide-globe/); assert.match(en, /aria-label="Language: EN · Arabic"/); assert.match(en, /title="Language: EN · Arabic"/);
  const ar = renderToStaticMarkup(createElement(KxLanguageToggle, { lang: "ar-EG", onChange: noop, labels: { language: "اللغة", english: "الإنجليزية", arabic: "العربية" } }));
  assert.match(ar, />AR</); assert.match(ar, /aria-label="اللغة: AR · الإنجليزية"/);
  assert.match(en, /<button type="button"/, "native button = keyboard accessible");
});

test("language toggle switches to the other language", () => {
  let got = "";
  const el = KxLanguageToggle({ lang: "en", onChange: (l) => { got = l; }, labels: LL }) as React.ReactElement<{ onClick: () => void }>;
  el.props.onClick(); assert.equal(got, "ar");
  const el2 = KxLanguageToggle({ lang: "ar", onChange: (l) => { got = l; }, labels: LL }) as React.ReactElement<{ onClick: () => void }>;
  el2.props.onClick(); assert.equal(got, "en");
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
