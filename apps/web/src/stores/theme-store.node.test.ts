import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_THEME_ID,
  THEME_IDS,
  isClinicalOsTheme,
  isDarkTheme,
  isThemeId,
} from "./theme-store";

test("default theme is Clinical OS light", () => {
  assert.equal(DEFAULT_THEME_ID, "clinical-os-light");
});

test("clinical-os theme ids are registered", () => {
  assert.equal(isThemeId("clinical-os-light"), true);
  assert.equal(isThemeId("clinical-os-dark"), true);
  assert.ok(THEME_IDS.includes("clinical-os-light"));
  assert.ok(THEME_IDS.includes("clinical-os-dark"));
});

test("clinical-os dark uses dark flag", () => {
  assert.equal(isDarkTheme("clinical-os-dark"), true);
  assert.equal(isDarkTheme("clinical-os-light"), false);
  assert.equal(isClinicalOsTheme("clinical-os-light"), true);
  assert.equal(isClinicalOsTheme("material-light"), false);
});