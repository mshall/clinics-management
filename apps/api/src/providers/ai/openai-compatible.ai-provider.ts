import type {
  AiChatCompletionRequest,
  AiChatCompletionResult,
  AiProvider,
  AiRuntimeConfig,
} from "./ai-provider.interface";

export const OPENAI_COMPATIBLE_AI_KEY = "openai-compatible";

/** POST {baseUrl}/chat/completions — works with OpenAI, vLLM, Ollama OpenAI shim, etc. */
export class OpenAiCompatibleAiProvider implements AiProvider {
  readonly key = OPENAI_COMPATIBLE_AI_KEY;

  async chatCompletion(config: AiRuntimeConfig, request: AiChatCompletionRequest): Promise<AiChatCompletionResult> {
    const apiKey = config.apiKey?.trim();
    if (!apiKey) return { ok: false, error: "AI API key not configured for this market" };

    const base = config.baseUrl.replace(/\/$/, "");
    const url = `${base}/chat/completions`;

    const body: Record<string, unknown> = {
      model: config.model,
      temperature: request.temperature ?? 0.25,
      max_tokens: request.maxTokens ?? 1000,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
        ...(m.name ? { name: m.name } : {}),
      })),
    };
    if (request.tools?.length) {
      body.tools = request.tools;
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { ok: false, error: `AI HTTP ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ""}` };
      }
      const data = (await res.json()) as {
        choices?: {
          finish_reason?: string;
          message?: {
            content?: string | null;
            tool_calls?: {
              id: string;
              type: "function";
              function: { name: string; arguments: string };
            }[];
          };
        }[];
      };
      const choice = data.choices?.[0];
      const msg = choice?.message;
      const content = typeof msg?.content === "string" ? msg.content.trim() : "";
      const toolCalls = msg?.tool_calls?.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: tc.function,
      }));
      if (!content && !toolCalls?.length) return { ok: false, error: "Empty AI response" };
      return {
        ok: true,
        content,
        toolCalls,
        finishReason: choice?.finish_reason,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
    }
  }
}