import { Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { StatusChip, Surface } from "@/brand/ui-kit";

/**
 * Payroll / compensation surfaces (Kiorly by Kiorex redesign, Q11g): one grouped, labelled block for contract + salary fields,
 * and one prominent read-only summary. Salary figures are LTR tabular numerals inside RTL pages.
 */
export function CompensationFields({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:col-span-2 sm:grid-cols-2 md:col-span-2" data-testid="compensation-fields">
      <legend className="flex items-center gap-2 px-2 text-sm font-semibold"><Wallet className="h-4 w-4 text-primary" aria-hidden />{title}</legend>
      {hint ? <p className="kx-callout text-xs sm:col-span-2" data-tone="info">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

export function CompensationSummary({ label, amount, contractLabel, contract, hint }: { label: string; amount: ReactNode; contractLabel: string; contract: ReactNode; hint?: ReactNode }) {
  return (
    <Surface className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end" data-testid="compensation-summary">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Wallet className="h-3.5 w-3.5" aria-hidden />{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums ltr-nums" dir="ltr">{amount}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{contractLabel}</span><StatusChip tone="brand" dot={false}>{contract}</StatusChip></div>
    </Surface>
  );
}
