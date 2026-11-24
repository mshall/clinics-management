import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BadgeCheck, Hourglass } from "lucide-react";
import { EmptyState } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GrowthAccess } from "./growth-api";
import { useAddVerificationEvidence, useCreateVerification, useVerificationRequests, useWithdrawVerification, type VerificationField } from "./provider-marketing-api";
import { errorCodeOf, needsEvidence, parseEvidence } from "./provider-marketing-logic";

const FIELDS: VerificationField[] = ["LICENSE_NUMBER", "SPECIALTY", "ADDRESS", "DISPLAY_NAME", "PHOTO", "DOCUMENT"];

/** GRW-P2-C verification update requests: ask Kiorex ops to change a verified field. The value is encrypted by the server and never leaves in an event. */
export function VerificationRequests({ clinicId, access }: { clinicId: string; access: GrowthAccess }) {
  const { t, i18n } = useTranslation();
  const list = useVerificationRequests(clinicId);
  const create = useCreateVerification();
  const withdraw = useWithdrawVerification();
  const addEvidence = useAddVerificationEvidence();
  const [field, setField] = useState<VerificationField>("LICENSE_NUMBER");
  const [value, setValue] = useState("");
  const [evidence, setEvidence] = useState("");
  const [more, setMore] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const admin = access.can.widget || access.level === "admin";
  const locale = i18n.language.startsWith("ar") ? "ar-EG" : "en";

  const submit = async () => {
    setError(null);
    const ev = parseEvidence(evidence);
    if (!value.trim() || ev.invalid.length || (needsEvidence(field) && ev.refs.length === 0)) { setError(t("growth.pm.verification.invalid")); return; }
    try {
      await create.mutateAsync({ clinicId, field, newValue: value.trim(), evidenceFileRefs: ev.refs });
      toast.success(t("growth.pm.verification.sent"));
      setValue("");
      setEvidence("");
    } catch (e) {
      setError(errorCodeOf(e) === "VERIFICATION_REQUEST_STATE" ? t("growth.pm.verification.open") : t("growth.pm.verification.invalid"));
    }
  };
  const badge = list.data?.badge ?? "VERIFIED";

  return (
    <Card data-testid="verification-requests">
      <CardHeader>
        <CardTitle className="text-base">{t("growth.pm.verification.title")}</CardTitle>
        <CardDescription>{t("growth.pm.verification.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {list.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("growth.pm.common.loading")}</p> : null}
        {list.isError ? <EmptyState tone="error" compact title={t("growth.pm.common.error")} action={<Button size="sm" variant="outline" onClick={() => void list.refetch()}>{t("growth.pm.common.retry")}</Button>} /> : null}
        {list.data ? (
          <p className="flex items-start gap-2 rounded-lg border p-3 text-sm" data-testid="verification-badge" data-badge={badge}>
            {badge === "VERIFIED" ? <BadgeCheck className="mt-0.5 size-4 text-emerald-600" aria-hidden /> : <Hourglass className="mt-0.5 size-4 text-amber-600" aria-hidden />}
            <span><span className="font-medium">{t(`growth.pm.verification.badge.${badge}`)}.</span> {t(`growth.pm.verification.badgeHint.${badge}`)}</span>
          </p>
        ) : null}

        {admin ? (
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(); }} data-testid="verification-form">
            <div className="space-y-1">
              <Label htmlFor="vr-field">{t("growth.pm.verification.fieldLabel")}</Label>
              <select id="vr-field" className="native-select h-10" value={field} onChange={(e) => setField(e.target.value as VerificationField)} data-testid="vr-field">
                {FIELDS.map((f) => <option key={f} value={f}>{t(`growth.pm.verification.field.${f}`)}</option>)}
              </select>
              <Input aria-label={t("growth.pm.verification.newValue")} placeholder={t("growth.pm.verification.newValue")} value={value} onChange={(e) => setValue(e.target.value)} maxLength={300} data-testid="vr-value" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vr-evidence">{t("growth.pm.verification.evidence")}</Label>
              <Textarea id="vr-evidence" rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} data-testid="vr-evidence" />
              <p className="text-xs text-muted-foreground">{t("growth.pm.verification.evidenceHint")}</p>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={create.isPending} data-testid="vr-submit">{t("growth.pm.verification.submit")}</Button>
              {error ? <p role="alert" className="mt-2 text-sm text-destructive" data-testid="vr-error">{error}</p> : null}
            </div>
          </form>
        ) : <p className="text-sm text-muted-foreground">{t("growth.pm.verification.adminOnly")}</p>}

        {list.isSuccess && list.data.items.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="vr-empty">{t("growth.pm.verification.empty")}</p> : null}
        <ul className="space-y-2">
          {(list.data?.items ?? []).map((r) => (
            <li key={r.id} className="rounded-lg border p-3 text-sm" data-testid={`vr-${r.id}`} data-status={r.status}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{t(`growth.pm.verification.field.${r.field}`)}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs" data-testid="vr-status">{t(`growth.pm.verification.status.${r.status}`)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString(locale)} · {t("growth.pm.verification.count", { count: r.evidenceCount })}</p>
              {r.decisionNote ? <p className="mt-1 text-sm"><span className="font-medium">{t("growth.pm.verification.note")}:</span> {r.decisionNote}</p> : null}
              {admin && (r.status === "SUBMITTED" || r.status === "NEEDS_INFO") ? (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  {r.status === "NEEDS_INFO" ? (
                    <>
                      <Input aria-label={t("growth.pm.verification.addEvidence")} className="max-w-xs" value={more[r.id] ?? ""} onChange={(e) => setMore((m) => ({ ...m, [r.id]: e.target.value }))} placeholder="uploads/file.pdf" />
                      <Button size="sm" onClick={() => { const ev = parseEvidence(more[r.id] ?? ""); if (ev.refs.length && !ev.invalid.length) addEvidence.mutate({ id: r.id, evidenceFileRefs: ev.refs }); }}>{t("growth.pm.verification.addEvidence")}</Button>
                    </>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => withdraw.mutate(r.id)} data-testid="vr-withdraw">{t("growth.pm.verification.withdraw")}</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
