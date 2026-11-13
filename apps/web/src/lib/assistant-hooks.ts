import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/http";

export type AssistantContext = {
  persona: "organization_admin" | "physician";
  title: string;
  greeting: string;
  suggestedPrompts: string[];
  allowedNavKeys: string[];
};

export type AssistantChatResponse = {
  reply: string;
  persona: "organization_admin" | "physician";
  suggestedPrompts: string[];
};

export function useAssistantContextQuery(enabled: boolean, locale: string) {
  return useQuery({
    queryKey: ["assistant", "context", locale],
    queryFn: () => apiGet<AssistantContext>(`/api/v1/assistant/context?locale=${locale === "ar" ? "ar" : "en"}`),
    enabled,
    staleTime: 60_000,
  });
}

export function useAssistantChatMutation() {
  return useMutation({
    mutationFn: (body: { message: string; locale: "en" | "ar" }) =>
      apiPost<AssistantChatResponse>("/api/v1/assistant/chat", body),
  });
}
