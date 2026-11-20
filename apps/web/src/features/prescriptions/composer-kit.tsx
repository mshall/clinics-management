import { Ban, Download, Eye, FileText, FileUp, Pill, Printer, Trash2, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusChip, Surface, kcn } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Prescription composer building blocks (Kiorly by Kiorex redesign, Q11g). One look for the encounter composer and the
 * draft panel: segmented mode switch in brand tokens, medication lines as cards with dosage/frequency chips, a calm upload
 * target, a preview card, and `kx-callout` hints. Logical (RTL-safe) utilities only; clinical numbers stay LTR.
 */
export type ComposerMode = "none" | "manual" | "prescription";

export function ComposerModeTabs({ medCount, rxCount }: { medCount: number; rxCount: number }) {
  const { t } = useTranslation();
  const trigger = "min-h-11 flex-1 gap-1.5 rounded-lg px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-kx-1";
  const count = (n: number) => (n > 0 ? <span className="ms-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background/90 px-1.5 text-[11px] font-semibold tabular-nums text-foreground" data-testid="composer-count">{n}</span> : null);
  return (
    <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl bg-muted/70 p-1" aria-label={t("encounters.medications")}>
      <TabsTrigger value="none" className={trigger}><Ban className="h-4 w-4 shrink-0" aria-hidden /><span className="hidden sm:inline">{t("encounters.medModeNone")}</span><span className="sm:hidden">{t("encounters.medTabNoneShort", "None")}</span></TabsTrigger>
      <TabsTrigger value="manual" className={trigger}><Pill className="h-4 w-4 shrink-0" aria-hidden /><span className="hidden sm:inline">{t("encounters.medModeManual")}</span><span className="sm:hidden">{t("encounters.medTabManualShort", "Manual")}</span>{count(medCount)}</TabsTrigger>
      <TabsTrigger value="prescription" className={trigger}><FileUp className="h-4 w-4 shrink-0" aria-hidden /><span className="hidden sm:inline">{t("encounters.medModePrescription")}</span><span className="sm:hidden">{t("encounters.medTabRxShort", "Rx")}</span>{count(rxCount)}</TabsTrigger>
    </TabsList>
  );
}

/** Panel body used inside each TabsContent: same surface for all three modes, tone only for the guidance callouts. */
export function ComposerPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <Surface className={kcn("space-y-4 p-4 sm:p-5", className)}>{children}</Surface>;
}

export function ComposerHint({ tone = "info", children }: { tone?: "info" | "warn" | "good"; children: ReactNode }) {
  return <p className="kx-callout text-sm" data-tone={tone}>{children}</p>;
}

export function ComposerEmpty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground"><span aria-hidden className="text-muted-foreground/70">{icon ?? <Pill className="h-5 w-5" />}</span>{children}</div>;
}

export function MedLine({ name, dosage, frequency, unverified, unverifiedLabel, onRemove, removing, removeLabel }: { name: string; dosage?: string | null; frequency?: string | null; unverified?: boolean; unverifiedLabel?: string; onRemove?: () => void; removing?: boolean; removeLabel: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-kx-1" data-testid="med-line">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Pill className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" dir="auto">{name}{unverified ? <StatusChip tone="warn" dot={false} className="ms-2 align-middle">{unverifiedLabel}</StatusChip> : null}</p>
        {(dosage || frequency) ? (
          <p className="mt-1 flex flex-wrap gap-1.5">
            {dosage ? <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground" dir="auto">{dosage}</span> : null}
            {frequency ? <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground" dir="auto">{frequency}</span> : null}
          </p>
        ) : null}
      </div>
      {onRemove ? (
        <Button type="button" variant="ghost" size="sm" className="shrink-0 text-destructive hover:text-destructive" onClick={onRemove} disabled={removing} aria-label={`${removeLabel}: ${name}`}>
          <Trash2 className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">{removeLabel}</span>
        </Button>
      ) : null}
    </li>
  );
}

export function RxDropzone({ onPick, disabled, title, hint }: { onPick: () => void; disabled?: boolean; title: string; hint: string }) {
  return (
    <button type="button" onClick={onPick} disabled={disabled} className={kcn("flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-accent/40 px-4 py-7 text-sm transition-colors hover:border-primary/60 hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring", disabled && "pointer-events-none opacity-60")}>
      <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"><FileUp className="h-5 w-5" /></span>
      <span className="font-semibold">{title}</span>
      <span className="max-w-sm text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

export function RxFileRow({ name, onView, onReplace, onRemove, viewLabel, replaceLabel, removeLabel, busy }: { name: string; onView?: () => void; onReplace?: () => void; onRemove?: () => void; viewLabel: string; replaceLabel: string; removeLabel: string; busy?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-kx-1" data-testid="rx-file-row">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground"><FileText className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium" dir="auto">{name}</span>
      <div className="flex shrink-0 gap-1">
        {onView ? <Button type="button" variant="ghost" size="sm" onClick={onView} aria-label={`${viewLabel}: ${name}`}><Eye className="h-4 w-4" aria-hidden /></Button> : null}
        {onReplace ? <Button type="button" variant="ghost" size="sm" onClick={onReplace} aria-label={`${replaceLabel}: ${name}`}><Upload className="h-4 w-4" aria-hidden /></Button> : null}
        {onRemove ? <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onRemove} disabled={busy} aria-label={`${removeLabel}: ${name}`}><Trash2 className="h-4 w-4" aria-hidden /></Button> : null}
      </div>
    </li>
  );
}

/** Generate action with its hint, and the preview card (download / print) shown after generation. */
export function GenerateBar({ onGenerate, pending, label, hint }: { onGenerate: () => void; pending?: boolean; label: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 p-3">
      <Button type="button" variant="secondary" className="gap-2" disabled={pending} onClick={onGenerate}><FileText className="h-4 w-4" aria-hidden />{label}</Button>
      <p className="min-w-0 flex-1 basis-48 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export function RxPreview({ url, title, downloadName, downloadLabel, printLabel, onPrint, maxHeight = "min(60vh,480px)" }: { url: string; title: string; downloadName: string; downloadLabel: string; printLabel: string; onPrint: () => void; maxHeight?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="rx-preview">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2"><p className="text-sm font-semibold">{title}</p><StatusChip tone="good">PNG</StatusChip></div>
      <div className="bg-muted/40 p-3"><img src={url} alt={title} className="mx-auto w-full rounded-md border border-border bg-white object-contain" style={{ maxHeight }} /></div>
      <div className="flex flex-wrap gap-2 border-t border-border/70 px-3 py-2.5">
        <Button type="button" size="sm" variant="outline" className="gap-1.5" asChild><a href={url} download={downloadName}><Download className="h-3.5 w-3.5" aria-hidden />{downloadLabel}</a></Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onPrint}><Printer className="h-3.5 w-3.5" aria-hidden />{printLabel}</Button>
      </div>
    </div>
  );
}

/** Add-medication form row: labelled fields on a quiet muted band, primary action full width on phones. */
export function AddMedForm({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
