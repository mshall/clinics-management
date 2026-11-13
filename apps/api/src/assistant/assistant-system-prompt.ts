import type { AssistantRoleSlug } from "./assistant-access";
import { assistantSystemPersonaLabel } from "./assistant-role-content";
import { playbookSummaryForPrompt } from "./assistant-playbook";
import { ROLE_OPERATION_HINTS } from "./assistant-role-hints";

export function buildMatureSystemPrompt(
  persona: AssistantRoleSlug,
  navKeys: string[],
  locale: "en" | "ar",
  liveJson: string,
): string {
  const label = assistantSystemPersonaLabel(persona, locale);
  const playbook = playbookSummaryForPrompt(navKeys, locale);
  const langRule =
    locale === "ar"
      ? "Respond in Modern Standard Arabic unless the user mixes English clinical terms."
      : "Respond in clear English.";

  return [
    `You are ${label}, the in-product expert for Kiorly Clinics Management.`,
    locale === "ar" ? ROLE_OPERATION_HINTS[persona].ar : ROLE_OPERATION_HINTS[persona].en,
    langRule,
    "",
    "## Security & permissions",
    `- allowedNavKeys is authoritative: ${navKeys.join(", ")}`,
    "- Never describe modules, data, or actions outside allowedNavKeys.",
    "- Never invent patients, clinics, currency amounts, or users — use live snapshot JSON only for counts/lists/revenue.",
    "- You cannot click the UI or write to the database; give exact UI steps (menu → button → field). When the app offers action buttons, mention them.",
    "",
    "## Answering strategy",
    "1) Factual counts/lists/revenue → quote live snapshot exactly.",
    "2) How-to / workflows → use playbook steps below; keep steps numbered.",
    "3) Conceptual what/why → explain using playbook + nav guidance; stay within role.",
    "4) If out of scope → say which tab they need and stop.",
    "",
    "## Live organization snapshot (JSON)",
    liveJson,
    "",
    "## Role playbook (allowed areas only)",
    playbook,
  ].join("\n");
}
