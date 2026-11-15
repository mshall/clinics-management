import { OpenAiCompatibleAiProvider, OPENAI_COMPATIBLE_AI_KEY } from "./openai-compatible.ai-provider";
import type { AiProvider } from "./ai-provider.interface";

const providers: Map<string, AiProvider> = new Map([[OPENAI_COMPATIBLE_AI_KEY, new OpenAiCompatibleAiProvider()]]);

export function getAiProvider(key: string): AiProvider | null {
  return providers.get(key) ?? null;
}

export function defaultAiProviderKey(): string {
  return OPENAI_COMPATIBLE_AI_KEY;
}