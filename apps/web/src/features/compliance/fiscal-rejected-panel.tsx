import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/http";
import { toast } from "sonner";

type FiscalQueueRow = {
  id: string;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
  clinicId: string;
};

export function FiscalRejectedPanel({ clinicId }: { clinicId?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [issuerRin, setIssuerRin] = useState("");

  const queue = useQuery({
    queryKey: ["compliance", "eta-queue", clinicId],
    queryFn: () =>
      apiGet<FiscalQueueRow[]>(
        `/api/v1/compliance/egypt/eta-queue${clinicId ? `?clinicId=${encodeURIComponent(clinicId)}` : ""}`,
      ),
  });

  const rejected = (queue.data ?? []).filter((r) => r.status === "REJECTED");

  const resubmitMut = useMutation({
    mutationFn: (id: string) =>
      apiPost(`/api/v1/compliance/egypt/eta-queue/${id}/resubmit`, {
        buyerName: buyerName.trim() || undefined,
        itemCode: itemCode.trim() || undefined,
        issuerRin: issuerRin.trim() || undefined,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["compliance", "eta-queue"] });
      toast.success(t("compliance.fiscalResubmitQueued", "Corrected receipt queued for submit."));
      setActiveId(null);
      setBuyerName("");
      setItemCode("");
      setIssuerRin("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  if (!rejected.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("compliance.fiscalRejectedTitle", "Rejected ETA receipts")}</CardTitle>
        <CardDescription>
          {t(
            "compliance.fiscalRejectedDesc",
            "Fix validation issues and resend as a new document (references the rejected UUID).",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rejected.map((row) => (
          <div key={row.id} className="rounded-md border border-border p-3 text-sm">
            <p className="font-mono text-xs text-muted-foreground">{row.id}</p>
            {row.errorMessage ? <p className="mt-1 text-destructive">{row.errorMessage}</p> : null}
            {activeId === row.id ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("compliance.fiscalResubmitBuyer", "Buyer name")}</Label>
                  <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("compliance.fiscalResubmitItem", "Item code")}</Label>
                  <Input value={itemCode} onChange={(e) => setItemCode(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>{t("compliance.fiscalResubmitRin", "Tax registration (RIN)")}</Label>
                  <Input value={issuerRin} onChange={(e) => setIssuerRin(e.target.value)} />
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="button" size="sm" disabled={resubmitMut.isPending} onClick={() => resubmitMut.mutate(row.id)}>
                    {t("compliance.fiscalResubmitAction", "Queue corrected receipt")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setActiveId(null)}>
                    {t("common.cancel", "Cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" className="mt-2" size="sm" variant="secondary" onClick={() => setActiveId(row.id)}>
                {t("compliance.fiscalResubmitFix", "Fix & resend")}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}