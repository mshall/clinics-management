import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { nativeSelectClassName } from "@/lib/form-control-styles";
import { apiFetchBlob, apiGet, apiPost } from "@/lib/http";

export type PlatformVerificationRow = {
  id: string;
  clinicianName: string;
  clinicianEmail: string;
  tenantName: string;
  specialty: string | null;
  syndicateNumber: string | null;
  titleEn: string | null;
  titleAr: string | null;
  hasNationalId: boolean;
  documents: { kind: string; originalFileName: string }[];
  waitingMs: number | null;
  slaBreached: boolean | null;
  pendingAt: string | null;
};

type ReviewConfig = {
  slaTargetHours: number;
  checklistKeys: string[];
  rejectTemplates: { code: string; labelEn: string; labelAr: string }[];
};

function formatWaiting(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

type Props = {
  row: PlatformVerificationRow | null;
  config: ReviewConfig | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecided: () => void;
};

export function PlatformVerificationReviewDialog({ row, config, open, onOpenChange, onDecided }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [rejectCode, setRejectCode] = useState("ILLEGIBLE_DOCUMENTS");
  const [rejectNote, setRejectNote] = useState("");
  const [nationalId, setNationalId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setChecklist([]);
    setRejectNote("");
    setRejectCode(config?.rejectTemplates[0]?.code ?? "ILLEGIBLE_DOCUMENTS");
    setNationalId(null);
  }, [open, row?.id, config?.rejectTemplates]);

  const decideMut = useMutation({
    mutationFn: (body: {
      decision: "approve" | "reject";
      checklist: string[];
      rejectReasonCode?: string;
      rejectReason?: string;
    }) => apiPost(`/api/v1/admin/platform/verifications/${row!.id}/decision`, body),
    onSuccess: () => {
      toast.success(t("verification.reviewSaved", "Decision saved"));
      onDecided();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revealId = async () => {
    if (!row) return;
    try {
      const res = await apiGet<{ nationalId: string | null }>(
        `/api/v1/admin/platform/verifications/${row.id}/national-id`,
      );
      setNationalId(res.nationalId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const openDoc = async (kind: string) => {
    if (!row) return;
    const { blob } = await apiFetchBlob(`/api/v1/admin/platform/verifications/${row.id}/documents/${kind}/file`);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (!row) return null;

  const templateLabel = (code: string) => {
    const tpl = config?.rejectTemplates.find((x) => x.code === code);
    if (!tpl) return code;
    return isAr ? tpl.labelAr : tpl.labelEn;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("verification.reviewTitle", "Review verification")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 text-sm">
          <p>
            <span className="text-muted-foreground">{t("verification.clinician", "Clinician")}: </span>
            {row.clinicianName} ({row.clinicianEmail})
          </p>
          <p>
            <span className="text-muted-foreground">{t("verification.organization", "Organization")}: </span>
            {row.tenantName}
          </p>
          <p className="ltr-nums">
            <span className="text-muted-foreground">{t("verification.syndicateNumber", "Syndicate number")}: </span>
            {row.syndicateNumber ?? "—"}
          </p>
          {row.specialty ? (
            <p>
              <span className="text-muted-foreground">{t("verification.specialty", "Specialty")}: </span>
              {t(`clinicalSpecialty.${row.specialty}`, row.specialty)}
            </p>
          ) : null}
          <p
            className={
              row.slaBreached
                ? "font-medium text-destructive"
                : row.waitingMs != null
                  ? "text-amber-800 dark:text-amber-200"
                  : undefined
            }
          >
            {t("verification.slaWaiting", "Waiting")}: {formatWaiting(row.waitingMs)}
            {config ? (
              <span className="text-muted-foreground">
                {" "}
                / {t("verification.slaTarget", "SLA {{hours}}h", { hours: config.slaTargetHours })}
              </span>
            ) : null}
            {row.slaBreached ? ` · ${t("verification.slaBreached", "SLA breached")}` : null}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("verification.documents", "Documents")}</p>
          <div className="flex flex-wrap gap-2">
            {row.documents.map((d) => (
              <Button key={d.kind} type="button" size="sm" variant="outline" onClick={() => void openDoc(d.kind)}>
                {t(`verification.docKind.${d.kind}`, d.kind)}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("verification.checklist", "Review checklist")}</p>
          <ul className="space-y-2">
            {(config?.checklistKeys ?? []).map((key) => {
              const checked = checklist.includes(key);
              return (
                <li key={key} className="flex items-start gap-2 text-sm">
                  <input
                    id={`chk-${key}`}
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={(e) => {
                      setChecklist((prev) =>
                        e.target.checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key),
                      );
                    }}
                  />
                  <Label htmlFor={`chk-${key}`} className="font-normal leading-snug">
                    {t(`verification.checklistItem.${key}`, key)}
                  </Label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={!row.hasNationalId} onClick={() => void revealId()}>
            {t("verification.revealNationalId", "Reveal national ID")}
          </Button>
          {nationalId != null ? (
            <span className="rounded-md bg-muted px-2 py-1 text-sm ltr-nums">{nationalId || "—"}</span>
          ) : null}
        </div>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">{t("verification.rejectWithTemplate", "Reject with template")}</p>
          <select
            className={nativeSelectClassName}
            value={rejectCode}
            onChange={(e) => setRejectCode(e.target.value)}
          >
            {(config?.rejectTemplates ?? []).map((tpl) => (
              <option key={tpl.code} value={tpl.code}>
                {templateLabel(tpl.code)}
              </option>
            ))}
          </select>
          <Textarea
            placeholder={t("verification.rejectNote", "Optional note for the clinician")}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
        </div>

        <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            variant="destructive"
            disabled={decideMut.isPending}
            onClick={() =>
              decideMut.mutate({
                decision: "reject",
                checklist,
                rejectReasonCode: rejectCode,
                rejectReason: rejectNote.trim() || undefined,
              })
            }
          >
            {t("verification.reject", "Reject")}
          </Button>
          <Button
            type="button"
            disabled={decideMut.isPending}
            onClick={() => decideMut.mutate({ decision: "approve", checklist })}
          >
            {t("verification.approve", "Approve")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}