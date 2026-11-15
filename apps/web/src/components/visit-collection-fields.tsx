import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import type { VisitCollectionMode, VisitCollectionValue } from "@/lib/visit-collection";
import { useTenantMarket } from "@/lib/use-tenant-market";
import { cn } from "@/lib/utils";

type Props = {
  amount: number;
  value: VisitCollectionValue;
  onChange: (next: VisitCollectionValue) => void;
  disabled?: boolean;
  className?: string;
};

export function VisitCollectionFields({ amount, value, onChange, disabled, className }: Props) {
  const { t } = useTranslation();
  const marketQuery = useTenantMarket();
  const orgByKey = new Map(
    (marketQuery.data?.organizationPaymentChannels ?? []).map((c) => [c.channelKey.toUpperCase(), c]),
  );
  const transferChannels = marketQuery.data?.transferChannels?.length
    ? marketQuery.data.transferChannels
    : ["INSTAPAY", "FAWRY"];
  const defaultChannel = transferChannels[0] ?? "INSTAPAY";

  const labelForChannel = (ch: string) => {
    const org = orgByKey.get(ch.toUpperCase());
    if (org) return org.name;
    if (ch === "INSTAPAY") return t("visitCollection.instapay", "InstaPay");
    if (ch === "FAWRY") return t("visitCollection.fawry", "Fawry");
    return ch;
  };
  if (amount <= 0) return null;

  return (
    <div className={cn("space-y-3 rounded-lg border border-border bg-muted/30 p-3", className)}>
      <div className="space-y-1">
        <Label>{t("visitCollection.method", "Payment method")}</Label>
        <select
          className={nativeSelectClassName}
          disabled={disabled}
          value={value.mode}
          onChange={(e) => {
            const mode = e.target.value as VisitCollectionMode;
            onChange(
              mode === "MONEY_TRANSFER"
                ? { mode, transferChannel: value.transferChannel || defaultChannel, transferReference: value.transferReference ?? "" }
                : { mode: "CASH_ON_VISIT", transferChannel: "", transferReference: "" },
            );
          }}
        >
          <option value="CASH_ON_VISIT">{t("visitCollection.cashOnVisit", "Cash on visit")}</option>
          <option value="MONEY_TRANSFER">{t("visitCollection.moneyTransfer", "Money transfer")}</option>
        </select>
      </div>
      {value.mode === "MONEY_TRANSFER" ? (
        <>
          <div className="space-y-1">
            <Label>{t("visitCollection.transferChannel", "Transfer via")}</Label>
            {(() => {
              const sel = (value.transferChannel || defaultChannel).toUpperCase();
              const org = orgByKey.get(sel);
              if (!org?.accountNumber && !org?.mobileNumber) return null;
              return (
                <p className="text-xs text-muted-foreground ltr-nums">
                  {org.accountNumber ? `${t("admin.paymentChannelAccount", "Account number")}: ${org.accountNumber}` : null}
                  {org.accountNumber && org.mobileNumber ? " · " : null}
                  {org.mobileNumber ? `${t("admin.paymentChannelMobile", "Mobile number")}: ${org.mobileNumber}` : null}
                </p>
              );
            })()}
            <select
              className={nativeSelectClassName}
              disabled={disabled}
              value={value.transferChannel || defaultChannel}
              onChange={(e) =>
                onChange({
                  ...value,
                  transferChannel: e.target.value,
                })
              }
            >
              {transferChannels.map((ch: string) => (
                <option key={ch} value={ch}>
                  {labelForChannel(ch)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t("visitCollection.transactionId", "Transaction ID")}</Label>
            <Input
              disabled={disabled}
              value={value.transferReference ?? ""}
              maxLength={120}
              onChange={(e) => onChange({ ...value, transferReference: e.target.value })}
              placeholder={t("visitCollection.transactionIdPlaceholder", "Reference from the transfer receipt")}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}