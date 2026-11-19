import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveTable } from "@/components/responsive-table";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiGet, apiPost } from "@/lib/http";

type DisputeRow = {
  id: string;
  tenantName: string;
  amount: string;
  currency: string;
  reason: string;
  note: string | null;
  createdAt: string;
  slaBreached: boolean;
  patientInitials: string;
  clinicianName: string;
};

type List = { items: DisputeRow[]; total: number; slaWorkingDays: number };

export function PlatformCommissionDisputesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [row, setRow] = useState<DisputeRow | null>(null);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [resolution, setResolution] = useState("");

  const q = useQuery({
    queryKey: ["platform", "disputes", "OPEN"],
    queryFn: () => apiGet<List>("/api/v1/admin/platform/disputes?status=OPEN&pageSize=50"),
  });

  const resolveMut = useMutation({
    mutationFn: (body: { decision: "APPROVE" | "REJECT"; resolution?: string }) =>
      apiPost(`/api/v1/admin/platform/disputes/${row!.id}/resolve`, body),
    onSuccess: () => {
      toast.success(t("platform.disputes.resolved", "Dispute resolved"));
      setRow(null);
      void qc.invalidateQueries({ queryKey: ["platform", "disputes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.disputes.queueTitle", "Commission dispute queue")}</CardTitle>
          <CardDescription>
            {t("platform.disputes.queueHint", "Review open clinic disputes within {{days}} working days.", {
              days: q.data?.slaWorkingDays ?? 3,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable>
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="px-2 py-2 text-start">{t("platform.disputes.org", "Organization")}</th>
                  <th className="px-2 py-2 text-start">{t("admin.billing.kiorex.colAmount", "Amount")}</th>
                  <th className="px-2 py-2 text-start">{t("platform.disputes.reason", "Reason")}</th>
                  <th className="px-2 py-2 text-start">{t("admin.billing.kiorex.colPatient", "Patient")}</th>
                  <th className="px-2 py-2 text-start">{t("common.action", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.items ?? []).map((r) => (
                  <tr key={r.id} className={r.slaBreached ? "border-t bg-destructive/5" : "border-t"}>
                    <td className="px-2 py-2">
                      <div className="font-medium">{r.tenantName}</div>
                      <div className="text-xs text-muted-foreground">{r.clinicianName}</div>
                    </td>
                    <td className="px-2 py-2 ltr-nums">
                      {r.amount} {r.currency}
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant="outline">{t(`platform.disputes.reason_${r.reason}`, r.reason)}</Badge>
                      {r.note ? <p className="mt-1 text-xs text-muted-foreground">{r.note}</p> : null}
                    </td>
                    <td className="px-2 py-2">{r.patientInitials}</td>
                    <td className="px-2 py-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setRow(r)}>
                        {t("platform.disputes.review", "Review")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        </CardContent>
      </Card>

      <Dialog open={!!row} onOpenChange={(open) => !open && setRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("platform.disputes.reviewTitle", "Resolve dispute")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>{t("platform.disputes.decision", "Decision")}</Label>
              <select
                className={nativeSelectClassName}
                value={decision}
                onChange={(e) => setDecision(e.target.value as "APPROVE" | "REJECT")}
              >
                <option value="APPROVE">{t("platform.disputes.approve", "Approve — reverse charge")}</option>
                <option value="REJECT">{t("platform.disputes.reject", "Reject — keep charge")}</option>
              </select>
            </div>
            <div className="grid gap-1">
              <Label>{t("platform.disputes.reply", "Reply to clinic owner")}</Label>
              <Textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                rows={3}
                placeholder={t("platform.disputes.replyPlaceholder", "Message included in the owner notification")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={resolveMut.isPending || (decision === "REJECT" && !resolution.trim())}
              onClick={() =>
                resolveMut.mutate({
                  decision,
                  resolution: resolution.trim() || undefined,
                })
              }
            >
              {t("common.save", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}