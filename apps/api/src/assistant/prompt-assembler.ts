import { readFileSync } from "fs";
import { join } from "path";
import type { AssistantRoleSlug } from "./assistant-access";
import { assistantSystemPersonaLabel } from "./assistant-role-content";
import { playbookSummaryForPrompt } from "./assistant-playbook";

type RoleHintsFile = Record<string, { en: string; ar: string }>;

const PROMPT_ROOT = join(__dirname, "prompts");

function loadText(version: string, locale: "en" | "ar", templateName: string): string {
  const file = locale === "ar" ? `${templateName}.ar.template.md` : `${templateName}.en.template.md`;
  const path = join(PROMPT_ROOT, version, file);
  return readFileSync(path, "utf8");
}

function loadRoleHints(version: string): RoleHintsFile {
  const path = join(PROMPT_ROOT, version, "role-hints.json");
  return JSON.parse(readFileSync(path, "utf8")) as RoleHintsFile;
}

function interpolate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

export function assembleSystemPrompt(
  persona: AssistantRoleSlug,
  navKeys: string[],
  locale: "en" | "ar",
  liveJson: string,
  promptVersion = "v1",
): string {
  const hints = loadRoleHints(promptVersion);
  const roleHint = hints[persona]?.[locale] ?? hints.group_admin?.[locale] ?? "";
  const langRule =
    locale === "ar"
      ? "رد بالعربية الفصحى ما لم يخلط المستخدم مصطلحات إنجليزية سريرية."
      : "Respond in clear English.";
  const template = loadText(promptVersion, locale, "system");
  const playbook = playbookSummaryForPrompt(navKeys, locale);
  return interpolate(template, {
    PERSONA_LABEL: assistantSystemPersonaLabel(persona, locale),
    ROLE_HINT: roleHint,
    LANG_RULE: langRule,
    NAV_KEYS: navKeys.join(", "),
    LIVE_JSON: liveJson,
    PLAYBOOK: playbook,
  });
}