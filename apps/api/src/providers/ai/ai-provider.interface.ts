/** Portable chat-completions surface — OpenAI-compatible servers only (no Assistants / file search). */

export type AiChatRole = "system" | "user" | "assistant" | "tool";

export type AiChatMessage = {
  role: AiChatRole;
  content: string;
  /** When role is tool, id from the assistant tool_calls entry */
  tool_call_id?: string;
  name?: string;
};

export type AiToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type AiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AiChatCompletionRequest = {
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: AiToolDefinition[];
};

export type AiChatCompletionResult =
  | { ok: true; content: string; toolCalls?: AiToolCall[]; finishReason?: string }
  | { ok: false; error: string };

export type AiRuntimeConfig = {
  providerKey: string;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  promptVersion: string;
};

export interface AiProvider {
  readonly key: string;
  chatCompletion(config: AiRuntimeConfig, request: AiChatCompletionRequest): Promise<AiChatCompletionResult>;
}