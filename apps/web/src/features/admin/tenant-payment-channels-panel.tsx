import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDelete, apiGet, apiPost } from "@/lib/http";

type Channel = {
  id: string;
  name: string;
  channelKey: string;
  accountNumber: string | null;
  mobileNumber: string | null;
};

export function TenantPaymentChannelsPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");

  const { data } = useQuery({
    queryKey: ["admin", "payment-channels"],
    queryFn: () => apiGet<{ channels: Channel[] }>("/api/v1/admin/payment-channels"),
  });

  const createMut = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/admin/payment-channels", {
        name: name.trim(),
        accountNumber: accountNumber.trim() || undefined,
        mobileNumber: mobileNumber.trim() || undefined,
      }),
    onSuccess: () => {
      setName("");
      setAccountNumber("");
      setMobileNumber("");
      void qc.invalidateQueries({ queryKey: ["admin", "payment-channels"] });
      void qc.invalidateQueries({ queryKey: ["markets", "current"] });
      toast.success(t("admin.paymentChannelCreated", "Payment channel added"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/admin/payment-channels/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "payment-channels"] });
      void qc.invalidateQueries({ queryKey: ["markets", "current"] });
      toast.success(t("admin.paymentChannelRemoved", "Payment channel removed"));
    },
  });

  const channels = data?.channels ?? [];

  const handleAdd = () => {
    if (createMut.isPending) return;
    if (!name.trim()) {
      toast.error(t("admin.paymentChannelNameRequired", "Enter a payment channel name"));
      return;
    }
    if (!accountNumber.trim() && !mobileNumber.trim()) {
      toast.error(
        t(
          "admin.paymentChannelContactRequired",
          "Enter an account number and/or a mobile number",
        ),
      );
      return;
    }
    createMut.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.paymentChannelsTitle", "Payment channels")}</CardTitle>
        <CardDescription>
          {t(
            "admin.paymentChannelsHint",
            "Custom transfer options for front desk and billing. Market defaults (InstaPay, Fawry) still apply when enabled.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {channels.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pe-2">{t("admin.paymentChannelName", "Name")}</th>
                  <th className="py-2 pe-2">{t("admin.paymentChannelKey", "Channel ID")}</th>
                  <th className="py-2 pe-2">{t("admin.paymentChannelAccount", "Account")}</th>
                  <th className="py-2 pe-2">{t("admin.paymentChannelMobile", "Mobile")}</th>
                  <th className="py-2 text-end" />
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <td className="py-2 pe-2 font-medium">{c.name}</td>
                    <td className="py-2 pe-2 font-mono text-xs">{c.channelKey}</td>
                    <td className="py-2 pe-2 ltr-nums">{c.accountNumber ?? "—"}</td>
                    <td className="py-2 pe-2 ltr-nums">{c.mobileNumber ?? "—"}</td>
                    <td className="py-2 text-end">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={deleteMut.isPending}
                        onClick={() => deleteMut.mutate(c.id)}
                        aria-label={t("common.delete", "Delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("admin.paymentChannelsEmpty", "No custom channels yet.")}</p>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium">{t("admin.paymentChannelAdd", "Add payment channel")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label required>{t("admin.paymentChannelName", "Name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>
            <div className="space-y-1">
              <Label optional>{t("admin.paymentChannelAccount", "Account number")}</Label>
              <Input className="ltr-nums" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={64} />
            </div>
            <div className="space-y-1">
              <Label optional>{t("admin.paymentChannelMobile", "Mobile number")}</Label>
              <Input className="ltr-nums" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} maxLength={24} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("admin.paymentChannelContactHint", "Provide at least an account number or a mobile number.")}
          </p>
          <Button type="button" disabled={createMut.isPending} onClick={handleAdd}>
            {t("admin.paymentChannelAddAction", "Add channel")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}