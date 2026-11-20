import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Lock, PenLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPost } from "@/lib/http";
import type { EncounterDetailDto } from "@/lib/api-types";

type Props = {
  encounter: EncounterDetailDto;
  canAmend: boolean;
};

export function EncounterSignoffTrail({ encounter, canAmend }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const fmt = (iso: string) => new Date(iso).toLocaleString(i18n.language);

  const amendMut = useMutation({
    mutationFn: (r: string) => apiPost<EncounterDetailDto>(`/api/v1/encounters/${encounter.id}/amend`, { reason: r }),
    onSuccess: () => {
      setOpen(false);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["encounter", encounter.id] });
      toast.success(t("encounters.amendedOpen", "Encounter reopened for amendment."));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const amendments = encounter.amendments ?? [];
  const locked = encounter.status === "FINALIZED" && Boolean(encounter.noteLockedAt);
  if (!encounter.signedAt && amendments.length === 0) return null;

  return (
    <section className="space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-sm" data-testid="encounter-signoff-trail">
      {encounter.signedAt ? (
        <p className="flex flex-wrap items-center gap-1.5" data-testid="encounter-signed-line">
          <ShieldCheck className="h-4 w-4 text-[hsl(var(--success))]" aria-hidden />
          {encounter.signedByName
            ? t("signoff.signedBy", "Signed by {{name}} · {{at}}", { name: encounter.signedByName, at: fmt(encounter.signedAt) })
            : t("signoff.signedAt", "Signed · {{at}}", { at: fmt(encounter.signedAt) })}
        </p>
      ) : null}
      {encounter.status === "FINALIZED" && encounter.noteLocksAt ? (
        <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground" data-testid="encounter-lock-line">
          <Lock className="h-4 w-4" aria-hidden />
          {locked
            ? t("signoff.lockedAt", "Locked {{at}} — changes need a documented amendment.", { at: fmt(encounter.noteLockedAt!) })
            : t("signoff.locksAt", "Editable until {{at}}, then the note locks.", { at: fmt(encounter.noteLocksAt) })}
        </p>
      ) : null}
      {amendments.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("signoff.trailTitle", "Amendment history")}
          </p>
          <ol className="space-y-1.5" data-testid="encounter-amendment-trail">
            {amendments.map((a, idx) => (
              <li key={a.id} className="rounded-md border border-border/60 bg-background px-2 py-1.5">
                <p className="font-medium">
                  {t("signoff.amendmentN", "Amendment {{n}}", { n: idx + 1 })} · {a.amendedByName || t("signoff.unknownUser", "Unknown user")} ·{" "}
                  {fmt(a.amendedAt)}
                </p>
                <p className="text-muted-foreground">{a.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {a.resignedAt
                    ? t("signoff.resigned", "Re-signed by {{name}} · {{at}}", {
                        name: a.resignedByName || t("signoff.unknownUser", "Unknown user"),
                        at: fmt(a.resignedAt),
                      })
                    : t("signoff.awaitingResign", "Open — not yet re-signed")}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {locked && canAmend ? (
        <Button type="button" size="sm" variant="secondary" className="min-h-10" onClick={() => setOpen(true)} data-testid="encounter-amend-open">
          <PenLine className="me-1 h-4 w-4" aria-hidden />
          {t("encounters.amendNote", "Amend locked note")}
        </Button>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("signoff.amendTitle", "Amend a signed note")}</DialogTitle>
            <DialogDescription>
              {t(
                "signoff.amendBody",
                "The original signature and your reason are kept in the amendment history. Sign the note again when you are done.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="amend-reason">{t("encounters.amendReasonPrompt", "Reason for amendment")}</Label>
            <Textarea
              id="amend-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="encounter-amend-reason"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={amendMut.isPending}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              type="button"
              disabled={reason.trim().length < 3 || amendMut.isPending}
              onClick={() => amendMut.mutate(reason.trim())}
              data-testid="encounter-amend-submit"
            >
              {t("signoff.amendConfirm", "Reopen for amendment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
