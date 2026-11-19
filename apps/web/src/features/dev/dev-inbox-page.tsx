import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/api-url";

type InboxMessage = {
  id: string;
  createdAt: string;
  channel: "EMAIL" | "WHATSAPP" | "SMS" | "PUSH";
  direction: "OUT" | "IN";
  toAddress: string;
  fromAddress: string | null;
  templateKey: string | null;
  subject: string | null;
  bodyText: string;
  bodyHtml: string | null;
  quickReplies: string[] | null;
  documentLink: string | null;
  providerMessageId: string | null;
  status: string;
};

type InboxStatus = { modes: Record<string, "mock" | "real"> };

const CHANNELS = ["", "EMAIL", "WHATSAPP", "SMS", "PUSH"] as const;

function devKey(): string {
  try {
    return window.localStorage.getItem("kiorly.devInboxKey") ?? "";
  } catch {
    return "";
  }
}

async function dev<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const key = devKey();
  const res = await fetch(apiUrl(`/api/v1/dev/inbox${path}`), {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(key ? { "X-Dev-Inbox-Key": key } : {}) },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/**
 * Mock-provider dev inbox (CLAUDE.md: messaging and provider integrations are MOCKED until pre-launch). Shows every
 * rendered email / WhatsApp / SMS / push, simulates delivery receipts and patient replies, and fires PSP callbacks
 * through the real handlers. Development tool: the API returns 404 in production unless explicitly enabled.
 */
export function DevInboxPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("");
  const [to, setTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyFrom, setReplyFrom] = useState("");
  const [psp, setPsp] = useState({ provider: "paymob", tenantId: "", invoiceId: "", amount: "", outcome: "succeeded" });
  const [notice, setNotice] = useState<string | null>(null);

  const status = useQuery({ queryKey: ["dev-inbox", "status"], queryFn: () => dev<InboxStatus>("/status"), retry: false });
  const list = useQuery({
    queryKey: ["dev-inbox", "list", channel, to],
    queryFn: () =>
      dev<{ items: InboxMessage[] }>(`?limit=100${channel ? `&channel=${channel}` : ""}${to ? `&to=${encodeURIComponent(to)}` : ""}`),
    refetchInterval: 4000,
    retry: false,
  });
  const selected = list.data?.items.find((m) => m.id === selectedId) ?? null;

  const refresh = () => void qc.invalidateQueries({ queryKey: ["dev-inbox"] });
  const run = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: (res) => {
      setNotice(JSON.stringify(res ?? {}).slice(0, 300));
      refresh();
    },
    onError: (e) => setNotice(String(e)),
  });

  const delivery = (state: "delivered" | "read" | "failed" | "bounced") =>
    selected && run.mutate(() => dev(`/messages/${selected.id}/delivery`, { method: "POST", body: { state } }));
  const reply = (payload?: string) =>
    selected &&
    run.mutate(() =>
      dev("/inbound/whatsapp", {
        method: "POST",
        body: {
          fromPhone: replyFrom || selected.toAddress,
          replyToId: selected.id,
          ...(payload ? { buttonPayload: payload } : { text: replyText }),
        },
      }),
    );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4" data-testid="dev-inbox-page">
      <Card>
        <CardHeader>
          <CardTitle>{t("devInbox.title", "Dev inbox (mock providers)")}</CardTitle>
          <CardDescription>
            {t(
              "devInbox.hint",
              "Messages are rendered here instead of being sent. Simulate delivery, patient replies and PSP callbacks. Real providers are wired in the pre-launch pass.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {status.isError ? (
            <p className="text-destructive">{t("devInbox.unavailable", "Dev inbox unavailable (production, or missing X-Dev-Inbox-Key).")}</p>
          ) : (
            <p>
              {Object.entries(status.data?.modes ?? {}).map(([k, v]) => (
                <span key={k} className="me-3 font-mono">
                  {k}: <b>{v}</b>
                </span>
              ))}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <select
              className="h-9 rounded-md border bg-background px-2"
              value={channel}
              onChange={(e) => setChannel(e.target.value as (typeof CHANNELS)[number])}
              aria-label={t("devInbox.channel", "Channel")}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c || t("devInbox.all", "All channels")}
                </option>
              ))}
            </select>
            <Input className="w-56" placeholder={t("devInbox.to", "To (email / phone)")} value={to} onChange={(e) => setTo(e.target.value)} />
            <Button type="button" variant="outline" onClick={refresh}>
              {t("common.refresh", "Refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("devInbox.messages", "Messages")}</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[32rem] space-y-1 overflow-auto">
            {(list.data?.items ?? []).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={`block w-full rounded border p-2 text-start text-xs ${m.id === selectedId ? "border-primary bg-accent" : ""}`}
              >
                <span className="font-mono">
                  {m.direction === "IN" ? "←" : "→"} {m.channel}
                </span>{" "}
                <b>{m.direction === "IN" ? m.fromAddress : m.toAddress}</b> · {m.status}
                <br />
                <span className="text-muted-foreground">{m.subject ?? m.templateKey ?? m.bodyText.slice(0, 70)}</span>
              </button>
            ))}
            {list.data && list.data.items.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("devInbox.empty", "No messages yet.")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selected ? (selected.subject ?? selected.templateKey ?? selected.channel) : t("devInbox.select", "Select a message")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {selected && (
              <>
                <p className="font-mono text-xs">
                  {selected.channel} · {selected.direction} · {selected.status} · {new Date(selected.createdAt).toLocaleString()}
                </p>
                {selected.bodyHtml ? (
                  <iframe title="rendered" sandbox="" srcDoc={selected.bodyHtml} className="h-64 w-full rounded border bg-white" />
                ) : (
                  <pre className="whitespace-pre-wrap rounded border p-2">{selected.bodyText}</pre>
                )}
                {selected.documentLink && (
                  <a className="underline" href={selected.documentLink} target="_blank" rel="noreferrer">
                    {selected.documentLink}
                  </a>
                )}
                {selected.direction === "OUT" && (
                  <div className="flex flex-wrap gap-2">
                    {(["delivered", "read", "failed", "bounced"] as const).map((s) => (
                      <Button key={s} type="button" size="sm" variant="outline" onClick={() => delivery(s)}>
                        {t(`devInbox.simulate.${s}`, `Mark ${s}`)}
                      </Button>
                    ))}
                  </div>
                )}
                {selected.channel === "WHATSAPP" && selected.direction === "OUT" && (
                  <div className="space-y-2 border-t pt-2">
                    <p className="font-medium">{t("devInbox.reply", "Simulate patient reply")}</p>
                    <div className="flex flex-wrap gap-2">
                      {(selected.quickReplies ?? []).map((q) => (
                        <Button key={q} type="button" size="sm" onClick={() => reply(q)}>
                          {q}
                        </Button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder={t("devInbox.replyFrom", "From phone (default: recipient)")} value={replyFrom} onChange={(e) => setReplyFrom(e.target.value)} />
                      <Input placeholder={t("devInbox.replyText", "Reply text (e.g. STOP)")} value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                      <Button type="button" size="sm" onClick={() => reply()} disabled={!replyText.trim()}>
                        {t("common.send", "Send")}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("devInbox.psp", "Simulate PSP callback")}</CardTitle>
          <CardDescription>{t("devInbox.pspHint", "Signed with the dev secret and sent through the real webhook handler.")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <select className="h-9 rounded-md border bg-background px-2" value={psp.provider} onChange={(e) => setPsp({ ...psp, provider: e.target.value })}>
            <option value="paymob">paymob</option>
            <option value="fawry">fawry</option>
          </select>
          <Input className="w-48" placeholder="tenantId" value={psp.tenantId} onChange={(e) => setPsp({ ...psp, tenantId: e.target.value })} />
          <Input className="w-48" placeholder="invoiceId" value={psp.invoiceId} onChange={(e) => setPsp({ ...psp, invoiceId: e.target.value })} />
          <Input className="w-28" placeholder="amount" value={psp.amount} onChange={(e) => setPsp({ ...psp, amount: e.target.value })} />
          <select className="h-9 rounded-md border bg-background px-2" value={psp.outcome} onChange={(e) => setPsp({ ...psp, outcome: e.target.value })}>
            <option value="succeeded">succeeded</option>
            <option value="failed">failed</option>
          </select>
          <Button
            type="button"
            onClick={() => run.mutate(() => dev("/psp/callback", { method: "POST", body: { ...psp, amount: psp.amount || undefined } }))}
            disabled={!psp.tenantId || !psp.invoiceId}
          >
            {t("devInbox.fire", "Fire callback")}
          </Button>
        </CardContent>
      </Card>
      {notice && <pre className="overflow-auto rounded border p-2 text-xs">{notice}</pre>}
    </div>
  );
}
