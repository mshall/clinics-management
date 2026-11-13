import { Bot, Loader2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { AssistantChatAction } from "@/lib/assistant-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/http";
import { cn } from "@/lib/utils";
import { useAssistantChatMutation, useAssistantContextQuery } from "@/lib/assistant-hooks";
import { useAuthStore } from "@/stores/auth-store";
import { isAssistantEnabledForRole } from "@/lib/assistant-policy";

type ChatLine = { role: "user" | "assistant"; text: string; actions?: AssistantChatAction[] };

export function RoleAssistantWidget() {
  const { i18n, t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const enabled = Boolean(accessToken && user && isAssistantEnabledForRole(user.role));
  const locale = i18n.language === "ar" ? "ar" : "en";
  const rtl = locale === "ar";

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const contextQ = useAssistantContextQuery(enabled && open, locale);
  const chatMut = useAssistantChatMutation();

  useEffect(() => {
    if (open && contextQ.data?.greeting && lines.length === 0) {
      setLines([{ role: "assistant", text: contextQ.data.greeting }]);
    }
  }, [open, contextQ.data?.greeting, lines.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, chatMut.isPending]);

  if (!enabled) return null;

  const send = (text: string) => {
    const message = text.trim();
    if (!message || chatMut.isPending) return;
    setDraft("");
    setLines((prev) => [...prev, { role: "user", text: message }]);
    chatMut.mutate(
      { message, locale },
      {
        onSuccess: (res) => {
          setLines((prev) => [
            ...prev,
            { role: "assistant", text: res.reply, actions: res.actions?.length ? res.actions : undefined },
          ]);
        },
        onError: (err) => {
          let text = t("assistant.errorReply", "Sorry, I could not respond right now. Try again in a moment.");
          if (err instanceof ApiError) {
            if (err.status === 404) {
              text = t(
                "assistant.errorNotAvailable",
                "The assistant API is not available on this server. Restart or redeploy the API (npm run dev), then try again.",
              );
            } else if (err.message.trim()) {
              text = err.message;
            }
          }
          setLines((prev) => [...prev, { role: "assistant", text }]);
        },
      },
    );
  };

  return (
    <div
      className={cn(
        "fixed bottom-5 z-50 flex flex-col items-end gap-2",
        rtl ? "left-4 items-start" : "right-4 items-end",
      )}
      dir={rtl ? "rtl" : "ltr"}
    >
      {open ? (
        <div
          className={cn(
            "flex w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg",
            "animate-in fade-in slide-in-from-bottom-2 duration-200",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Bot className="size-5 shrink-0 text-primary" aria-hidden />
              <p className="truncate text-sm font-semibold">
                {contextQ.data?.title ?? t("assistant.title", "Kiorly assistant")}
              </p>
            </div>
            <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => setOpen(false)}>
              <X className="size-4" />
              <span className="sr-only">{t("common.close", "Close")}</span>
            </Button>
          </div>
          <div ref={scrollRef} className="max-h-72 space-y-2 overflow-y-auto p-3 text-sm">
            {lines.map((line, idx) => (
              <div
                key={`${idx}-${line.role}`}
                className={cn(
                  "rounded-lg px-3 py-2",
                  line.role === "user" ? "bg-primary/10 text-foreground ms-6" : "bg-muted text-foreground me-6",
                )}
              >
                {line.text}
                {line.role === "assistant" && line.actions?.length ? (
                  <div className="mt-2 flex flex-col gap-1">
                    {line.actions.map((action) => {
                      const key = action.patientId ?? action.href ?? action.label;
                      const to =
                        action.type === "open_patient" && action.patientId
                          ? `/patients/${action.patientId}`
                          : action.type === "navigate" && action.href
                            ? action.href
                            : null;
                      if (!to) return null;
                      return (
                        <Button
                          key={key}
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-auto min-h-8 w-full justify-start whitespace-normal px-2 py-1.5 text-start text-xs"
                          asChild
                        >
                          <Link to={to} onClick={() => setOpen(false)}>
                            {action.label}
                          </Link>
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
            {chatMut.isPending ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("assistant.thinking", "Thinking…")}
              </p>
            ) : null}
          </div>
          {(contextQ.data?.suggestedPrompts.length ?? 0) > 0 ? (
            <div className="flex flex-wrap gap-1 border-t border-border px-2 py-2">
              {contextQ.data!.suggestedPrompts.map((p) => (
                <Button key={p} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => send(p)}>
                  {p}
                </Button>
              ))}
            </div>
          ) : null}
          <form
            className="flex gap-2 border-t border-border p-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("assistant.inputPlaceholder", "Ask in English or Arabic…")}
              disabled={chatMut.isPending}
              className="text-sm"
            />
            <Button type="submit" size="icon" disabled={!draft.trim() || chatMut.isPending} aria-label={t("assistant.send", "Send")}>
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      ) : null}
      <Button
        type="button"
        size="icon"
        className={cn(
          "size-14 rounded-full shadow-md",
          open ? "opacity-90" : "opacity-100",
        )}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("assistant.toggle", "Open AI assistant")}
      >
        <Bot className="size-7" />
      </Button>
    </div>
  );
}
