import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  transferReferenceIssue,
  transferReferenceMessage,
  type VisitCollectionValue,
} from "@/lib/visit-collection";
import { transferRulesFromMarket, useTenantMarket } from "@/lib/use-tenant-market";
import { cn } from "@/lib/utils";

type Props = {
  amount: number;
  value: VisitCollectionValue;
  onChange: (next: VisitCollectionValue) => void;
  disabled?: boolean;
  className?: string;
  /** Error to pin on the transaction-ID field (e.g. from the API). Cleared by the parent on edit. */
  referenceError?: string | null;
  /** Show the client-side reference check even before the field is blurred (after a submit attempt). */
  showErrors?: boolean;
  /** Enter in the transaction-ID field submits. */
  onSubmit?: () => void;
  /** Show "Alt+1…" hints on method chips (desktop). */
  shortcutHints?: boolean;
};

export type VisitCollectionFieldsHandle = { focusReference: () => void; selectOption: (index: number) => void };

type MethodOption = { id: string; label: string; next: VisitCollectionValue };

export const VisitCollectionFields = forwardRef<VisitCollectionFieldsHandle, Props>(function VisitCollectionFields(
  { amount, value, onChange, disabled, className, referenceError, showErrors, onSubmit, shortcutHints },
  ref,
) {
  const { t } = useTranslation();
  const marketQuery = useTenantMarket();
  const refInput = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);
  const [focusPending, setFocusPending] = useState(false);

  const orgByKey = new Map(
    (marketQuery.data?.organizationPaymentChannels ?? []).map((c) => [c.channelKey.toUpperCase(), c]),
  );
  const transferChannels = marketQuery.data?.transferChannels?.length
    ? marketQuery.data.transferChannels
    : ["INSTAPAY", "FAWRY"];
  const rules = transferRulesFromMarket(marketQuery.data);

  const labelForChannel = (ch: string) => {
    const org = orgByKey.get(ch.toUpperCase());
    if (org) return org.name;
    if (ch === "INSTAPAY") return t("visitCollection.instapay", "InstaPay");
    if (ch === "FAWRY") return t("visitCollection.fawry", "Fawry");
    return ch;
  };

  const options: MethodOption[] = [
    {
      id: "CASH_ON_VISIT",
      label: t("visitCollection.cash", "Cash"),
      next: { mode: "CASH_ON_VISIT", transferChannel: "", transferReference: "" },
    },
    ...transferChannels.map((ch) => ({
      id: ch,
      label: labelForChannel(ch),
      next: { mode: "MONEY_TRANSFER" as const, transferChannel: ch, transferReference: value.transferReference ?? "" },
    })),
  ];
  const selectedId = value.mode === "MONEY_TRANSFER" ? (value.transferChannel || "").toUpperCase() : "CASH_ON_VISIT";

  const pick = (opt: MethodOption) => {
    if (disabled) return;
    setTouched(false);
    onChange(opt.next);
    if (opt.next.mode === "MONEY_TRANSFER") setFocusPending(true);
  };

  useEffect(() => {
    if (!focusPending || value.mode !== "MONEY_TRANSFER") return;
    refInput.current?.focus();
    setFocusPending(false);
  }, [focusPending, value.mode]);

  // The handle must stay referentially stable: parents keep it in state (`ref={setHandle}`), and a handle rebuilt on every render
  // re-sets that state on every commit ("Maximum update depth exceeded"). The latest option picker is read through a ref.
  const selectRef = useRef<(index: number) => void>(() => {});
  useEffect(() => {
    selectRef.current = (index: number) => {
      const opt = options[index];
      if (opt) pick(opt);
    };
  });
  useImperativeHandle(
    ref,
    () => ({
      focusReference: () => refInput.current?.focus(),
      selectOption: (index: number) => selectRef.current(index),
    }),
    [],
  );

  if (amount <= 0) return null;

  const channel = value.mode === "MONEY_TRANSFER" ? value.transferChannel || "" : "";
  const issue = channel ? transferReferenceIssue(channel, value.transferReference ?? "", rules) : null;
  const typed = (value.transferReference ?? "").trim().length > 0;
  const localError =
    issue && (showErrors || (touched && typed)) ? transferReferenceMessage(issue, labelForChannel(channel), t) : null;
  const shownError = referenceError || localError;
  const org = channel ? orgByKey.get(channel.toUpperCase()) : undefined;

  return (
    <div className={cn("space-y-3 rounded-lg border border-border bg-muted/30 p-3", className)}>
      <div className="space-y-1.5">
        <Label id="visit-collection-method">{t("visitCollection.method", "Payment method")}</Label>
        <div role="radiogroup" aria-labelledby="visit-collection-method" className="flex flex-wrap gap-2">
          {options.map((opt, i) => {
            const active = opt.id === selectedId;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                data-testid={`collection-method-${opt.id}`}
                onClick={() => pick(opt)}
                className={cn(
                  "min-h-11 min-w-20 rounded-md border px-4 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                )}
              >
                {opt.label}
                {shortcutHints ? (
                  <kbd className="ms-2 hidden rounded border border-current/40 px-1 text-[11px] font-semibold lg:inline">
                    Alt+{i + 1}
                  </kbd>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      {value.mode === "MONEY_TRANSFER" ? (
        <div className="space-y-1">
          <Label htmlFor="visit-collection-ref">{t("visitCollection.transactionId", "Transaction ID")}</Label>
          {org?.accountNumber || org?.mobileNumber ? (
            <p className="text-xs text-muted-foreground ltr-nums">
              {org.accountNumber ? `${t("admin.paymentChannelAccount", "Account number")}: ${org.accountNumber}` : null}
              {org.accountNumber && org.mobileNumber ? " · " : null}
              {org.mobileNumber ? `${t("admin.paymentChannelMobile", "Mobile number")}: ${org.mobileNumber}` : null}
            </p>
          ) : null}
          <Input
            id="visit-collection-ref"
            ref={refInput}
            disabled={disabled}
            value={value.transferReference ?? ""}
            maxLength={120}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="done"
            className="min-h-11 ltr-nums"
            aria-invalid={shownError ? true : undefined}
            aria-describedby={shownError ? "visit-collection-ref-error" : undefined}
            data-testid="transfer-reference-input"
            onChange={(e) => onChange({ ...value, transferReference: e.target.value })}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && onSubmit) {
                e.preventDefault();
                setTouched(true);
                onSubmit();
              }
            }}
            placeholder={t("visitCollection.transactionIdPlaceholder", "Reference from the transfer receipt")}
          />
          {shownError ? (
            <p id="visit-collection-ref-error" role="alert" className="text-sm text-destructive" data-testid="transfer-reference-error">
              {shownError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
