import type { AssistantRoleSlug } from "./assistant-access";
import { assembleSystemPrompt } from "./prompt-assembler";

export function buildMatureSystemPrompt(
  persona: AssistantRoleSlug,
  navKeys: string[],
  locale: "en" | "ar",
  liveJson: string,
  promptVersion = "v1",
): string {
  return assembleSystemPrompt(persona, navKeys, locale, liveJson, promptVersion);
}
