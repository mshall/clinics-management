import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveTable } from "@/components/responsive-table";
import { apiGet } from "@/lib/http";
import type { OutboundMessageRow } from "@/features/messaging/outbound-message-log";
import { localeForLanguage } from "@/lib/locale-display";

export function AdminGovernanceWhatsappFailures() {
  const { t, i18n } = useTranslation();
  const q = useQuery({
    queryKey: ["messaging", "failures"],
    queryFn: () => apiGet<OutboundMessageRow[]>("/api/v1/messaging/failures"),
  });

  const rows = q.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("messaging.governanceTitle")}</CardTitle>
        <CardDescription>{t("messaging.governanceSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        {q.isError ? (
          <p className="text-sm text-destructive">{q.error instanceof Error ? q.error.message : t("common.error")}</p>
        ) : null}
        <ResponsiveTable>
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t("messaging.colWhen")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("messaging.colTemplate")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("messaging.colStatus")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("messaging.colClass")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("messaging.colError")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString(localeForLanguage(i18n.language))}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.templateKey ?? "—"}</td>
                  <td className="px-3 py-2">{t(`messaging.status.${r.status}`, r.status)}</td>
                  <td className="px-3 py-2">{(r as OutboundMessageRow & { failureClass?: string }).failureClass ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-destructive line-clamp-2">{r.error ?? "—"}</td>
                </tr>
              ))}
              {!q.isPending && !rows.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    {t("messaging.governanceEmpty")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </ResponsiveTable>
      </CardContent>
    </Card>
  );
}