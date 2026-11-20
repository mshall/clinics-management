import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveTable } from "@/components/responsive-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useEntitlement } from "@/hooks/use-entitlement";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiGet } from "@/lib/http";

type Turn = {
  id: string;
  fromPhone: string;
  inboundText: string;
  replyText: string;
  intent: string;
  handedOver: boolean;
  createdAt: string;
};

/** MS-06 — WhatsApp AI receptionist conversation inbox. */
export function AiReceptionistInboxPage() {
  const { t } = useTranslation();
  const entitled = useEntitlement("mod_messaging");
  const [handedOverOnly, setHandedOverOnly] = useState(false);

  const inbox = useQuery({
    queryKey: ["ai-receptionist-inbox", handedOverOnly],
    queryFn: () => {
      const q = handedOverOnly ? "?handedOverOnly=true" : "";
      return apiGet<Turn[]>(`/api/v1/messaging/ai-receptionist/inbox${q}`);
    },
    enabled: entitled,
    retry: false,
  });

  if (!entitled) {
    return <p className="p-6 text-sm text-muted-foreground">{t("aiReceptionist.denied")}</p>;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6" data-testid="ai-receptionist-inbox">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("aiReceptionist.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("aiReceptionist.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("aiReceptionist.inbox")}</CardTitle>
          <CardDescription>{t("aiReceptionist.inboxHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="handover-filter">{t("aiReceptionist.filter")}</Label>
            <select
              id="handover-filter"
              className={nativeSelectClassName}
              value={handedOverOnly ? "handover" : "all"}
              onChange={(e) => setHandedOverOnly(e.target.value === "handover")}
              data-testid="ai-receptionist-filter"
            >
              <option value="all">{t("aiReceptionist.filterAll")}</option>
              <option value="handover">{t("aiReceptionist.filterHandover")}</option>
            </select>
          </div>
          <ResponsiveTable>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-start">{t("aiReceptionist.when")}</th>
                  <th className="p-2 text-start">{t("aiReceptionist.phone")}</th>
                  <th className="p-2 text-start">{t("aiReceptionist.intent")}</th>
                  <th className="p-2 text-start">{t("aiReceptionist.inbound")}</th>
                  <th className="p-2 text-start">{t("aiReceptionist.reply")}</th>
                </tr>
              </thead>
              <tbody>
                {(inbox.data ?? []).map((row) => (
                  <tr key={row.id} className="border-t align-top" data-testid={`ai-turn-${row.id}`}>
                    <td className="p-2 ltr-nums whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="p-2 ltr-nums">{row.fromPhone}</td>
                    <td className="p-2">
                      <Badge variant={row.handedOver ? "muted" : "secondary"}>{row.intent}</Badge>
                      {row.handedOver ? (
                        <span className="ms-1 text-xs text-muted-foreground">{t("aiReceptionist.handedOver")}</span>
                      ) : null}
                    </td>
                    <td className="p-2 max-w-56">{row.inboundText}</td>
                    <td className="p-2 max-w-[16rem]">{row.replyText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
          {!inbox.isLoading && !(inbox.data ?? []).length ? (
            <p className="text-sm text-muted-foreground">{t("aiReceptionist.empty")}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
