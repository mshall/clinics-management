import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Feature } from "@/features/flags/feature";
import { apiFetchBlob, apiGet, apiPatch, apiPost, apiPostFormData } from "@/lib/http";
import { nativeSelectClassName } from "@/lib/form-control-styles";

type OrderItem = { id: string; nameEn: string; nameAr: string; resultValue: string | null };
type Order = {
  id: string;
  kind: "LAB" | "IMAGING";
  status: string;
  resultsPdfRelativePath?: string | null;
  items: OrderItem[];
};

type Props = {
  encounterId: string;
  clinicId: string;
  patientId: string;
};

export function EncounterOrdersPanel({ encounterId, clinicId, patientId }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [kind, setKind] = useState<"LAB" | "IMAGING">("LAB");
  const [itemName, setItemName] = useState("");

  const query = useQuery({
    queryKey: ["clinical", "orders", encounterId],
    queryFn: () => apiGet<Order[]>(`/api/v1/clinical/orders?encounterId=${encounterId}`),
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost<Order>("/api/v1/clinical/orders", {
        clinicId,
        patientId,
        encounterId,
        kind,
        items: [{ nameEn: itemName.trim(), nameAr: itemName.trim() }],
      }),
    onSuccess: () => {
      setItemName("");
      void qc.invalidateQueries({ queryKey: ["clinical", "orders", encounterId] });
      toast.success(t("clinicalOrders.created"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markReady = useMutation({
    mutationFn: (id: string) => apiPatch(`/api/v1/clinical/orders/${id}`, { status: "RESULTS_READY" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinical", "orders", encounterId] });
      toast.success(t("clinicalOrders.resultsReady"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const attachPdf = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiPostFormData(`/api/v1/clinical/orders/${id}/results-pdf`, fd, { enhance: false });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clinical", "orders", encounterId] });
      toast.success(t("clinicalOrders.pdfAttached", "Results PDF attached"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handoff = useMutation({
    mutationFn: (id: string) => apiPost<{ alreadyHandedOff: boolean }>(`/api/v1/clinical/orders/${id}/handoff`, {}),
    onSuccess: (r) => toast.success(r.alreadyHandedOff ? t("clinicalOrders.alreadyHandedOff", "Already sent to the lab") : t("clinicalOrders.handedOff", "Sent to the lab")),
    onError: (e: Error) => toast.error(e.message),
  });

  async function openPdf(id: string) {
    const { blob } = await apiFetchBlob(`/api/v1/clinical/orders/${id}/results-pdf`);
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  }

  return (
    <Card data-testid="encounter-orders-panel">
      <CardHeader>
        <CardTitle className="text-base">{t("clinicalOrders.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <select
            className={nativeSelectClassName}
            value={kind}
            onChange={(e) => setKind(e.target.value as "LAB" | "IMAGING")}
          >
            <option value="LAB">{t("clinicalOrders.kindLab")}</option>
            <option value="IMAGING">{t("clinicalOrders.kindImaging")}</option>
          </select>
          <Input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder={t("clinicalOrders.itemPlaceholder")}
            className="max-w-xs"
          />
          <Button
            type="button"
            size="sm"
            disabled={!itemName.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {t("clinicalOrders.add")}
          </Button>
        </div>
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (query.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">{t("clinicalOrders.empty")}</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {query.data!.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div>
                  <span className="font-medium">
                    {o.kind === "LAB" ? t("clinicalOrders.kindLab") : t("clinicalOrders.kindImaging")}
                  </span>
                  <span className="text-muted-foreground"> · {o.status}</span>
                  <div className="text-muted-foreground">
                    {o.items.map((it) => it.nameEn).join(", ")}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer text-xs underline">
                    {t("clinicalOrders.attachPdf", "Attach results PDF")}
                    <input
                      type="file"
                      accept="application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) attachPdf.mutate({ id: o.id, file: f });
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {o.resultsPdfRelativePath ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void openPdf(o.id).catch((e: Error) => toast.error(e.message))}>
                      {t("clinicalOrders.viewPdf", "View PDF")}
                    </Button>
                  ) : null}
                  {o.kind === "LAB" && o.status !== "CANCELLED" && o.status !== "DRAFT" ? (
                    <Feature flag="clinic.lab_order_handoff">
                      <Button type="button" size="sm" variant="outline" disabled={handoff.isPending} onClick={() => handoff.mutate(o.id)}>
                        {t("clinicalOrders.handoff", "Send to lab")}
                      </Button>
                    </Feature>
                  ) : null}
                {o.status !== "RESULTS_READY" && o.status !== "CANCELLED" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={markReady.isPending}
                    onClick={() => markReady.mutate(o.id)}
                  >
                    {t("clinicalOrders.markReady")}
                  </Button>
                ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
