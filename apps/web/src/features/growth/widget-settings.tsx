import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { EmptyState } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/http";
import { useSyncOnChange } from "@/lib/use-sync-on-change";
import { usePutWidget, useWidgetSettings, type GrowthAccess, type ProfilePreview, type WidgetSettingsDto } from "./growth-api";
import { WIDGET_MAX_ORIGINS, originProblems, parseOriginLines } from "./growth-logic";

type Draft = { enabled: boolean; origins: string; theme: WidgetSettingsDto["theme"]; locale: "ar" | "en"; languages: ("ar" | "en")[]; brandColor: string; doctorIds: string[] };
const toDraft = (w: WidgetSettingsDto): Draft => ({ enabled: w.enabled, origins: w.allowedOrigins.join("\n"), theme: w.theme, locale: w.locale, languages: w.settings.languages, brandColor: w.settings.brandColor ?? "", doctorIds: w.settings.doctorIds });

function CopyBlock({ label, value, testId }: { label: string; value: string; testId: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={testId}>{label}</Label>
        <Button type="button" size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(value).then(() => toast.success(t("growth.widget.copied"))).catch(() => toast.error(t("growth.links.copyFailed")))} data-testid={`${testId}-copy`}><Copy className="size-4" aria-hidden />{t("growth.widget.copy")}</Button>
      </div>
      <textarea id={testId} readOnly dir="ltr" rows={4} value={value} className="w-full rounded-md border border-input bg-muted/30 p-2 font-mono text-xs" data-testid={testId} />
    </div>
  );
}

export function WidgetSettings({ clinicId, access, profile }: { clinicId: string; access: GrowthAccess; profile?: ProfilePreview }) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const q = useWidgetSettings(clinicId);
  const put = usePutWidget();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadedFor, setLoadedFor] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  useSyncOnChange([q.data?.clinicId, q.data?.updatedAt ?? ""], () => {
    if (q.data && loadedFor !== q.data.clinicId) {
      setDraft(toDraft(q.data));
      setLoadedFor(q.data.clinicId);
    }
  });

  if (q.isPending) return <p role="status" className="text-sm text-muted-foreground">{t("growth.loading")}</p>;
  if (q.isError || !q.data || !draft) {
    return <EmptyState tone="error" compact title={t("growth.loadError")} action={<Button variant="outline" size="sm" onClick={() => void q.refetch()}>{t("growth.retry")}</Button>} />;
  }
  const w = q.data;
  const lines = parseOriginLines(draft.origins);
  const problems = originProblems(lines);
  const canEdit = access.can.widget && w.entitled;
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const invalid = problems.length > 0 || draft.languages.length === 0 || (draft.brandColor !== "" && !/^#[0-9a-fA-F]{6}$/.test(draft.brandColor)) || (draft.enabled && lines.length === 0);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (invalid || !canEdit || !draft) return;
    setServerError(null);
    put.mutate(
      { clinicId, enabled: draft.enabled, allowedOrigins: lines, theme: draft.theme, locale: draft.locale, settings: { brandColor: draft.brandColor || null, languages: draft.languages, doctorIds: draft.doctorIds, branchIds: [] } },
      {
        onSuccess: (d) => {
          setDraft(toDraft(d));
          toast.success(t("growth.widget.saved"));
        },
        onError: (err) => setServerError(err instanceof ApiError || err instanceof Error ? err.message : t("growth.loadError")),
      },
    );
  }

  return (
    <Card data-testid="widget-section">
      <CardHeader>
        <CardTitle className="text-base">{t("growth.widget.title")}</CardTitle>
        <CardDescription>{t("growth.widget.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!w.entitled ? <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm" data-testid="widget-needs-plan">{t("growth.widget.needsPlan")}</p> : null}
        {w.entitled && !access.can.widget ? <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm" data-testid="widget-admin-only">{t("growth.widget.adminOnly")}</p> : null}
        <form onSubmit={save} className="space-y-4" aria-label={t("growth.widget.title")}>
          <fieldset disabled={!canEdit} className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="size-4" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} data-testid="widget-enabled" />
              {t("growth.widget.enabled")}
            </label>
            <div className="space-y-1">
              <Label htmlFor="widget-origins">{t("growth.widget.origins")}</Label>
              <textarea
                id="widget-origins"
                dir="ltr"
                rows={4}
                className="w-full rounded-md border border-input bg-background p-2 font-mono text-sm"
                value={draft.origins}
                onChange={(e) => set({ origins: e.target.value })}
                aria-describedby="widget-origins-hint widget-origins-errors"
                aria-invalid={problems.length > 0}
                placeholder="https://www.myclinic.com"
                data-testid="widget-origins"
              />
              <p id="widget-origins-hint" className="text-xs text-muted-foreground">{t("growth.widget.originsHint")} ({lines.length}/{WIDGET_MAX_ORIGINS})</p>
              <ul id="widget-origins-errors" className="space-y-0.5 text-sm text-destructive" data-testid="widget-origin-errors" aria-live="polite">
                {problems.map((p) => <li key={`${p.line}-${p.problem}`} data-problem={p.problem}>{p.line}: <span dir="ltr">{p.origin}</span> – {t(`growth.widget.errors.${p.problem}`)}</li>)}
              </ul>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="widget-theme">{t("growth.widget.theme")}</Label>
                <select id="widget-theme" className="native-select h-10 w-full" value={draft.theme} onChange={(e) => set({ theme: e.target.value as Draft["theme"] })}>
                  {(["auto", "light", "dark"] as const).map((k) => <option key={k} value={k}>{t(`growth.widget.themes.${k}`)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="widget-locale">{t("growth.widget.locale")}</Label>
                <select id="widget-locale" className="native-select h-10 w-full" value={draft.locale} onChange={(e) => set({ locale: e.target.value as "ar" | "en" })}>
                  <option value="ar">{t("growth.widget.ar")}</option>
                  <option value="en">{t("growth.widget.en")}</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="widget-color">{t("growth.widget.brandColor")}</Label>
                <div className="flex gap-2">
                  <input type="color" aria-label={t("growth.widget.brandColor")} className="h-10 w-12 rounded-md border" value={draft.brandColor || "#0d9488"} onChange={(e) => set({ brandColor: e.target.value })} />
                  <Input id="widget-color" dir="ltr" value={draft.brandColor} placeholder="#0d9488" maxLength={7} onChange={(e) => set({ brandColor: e.target.value })} />
                </div>
              </div>
            </div>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">{t("growth.widget.languages")}</legend>
              <div className="flex gap-4">
                {(["ar", "en"] as const).map((l) => (
                  <label key={l} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={draft.languages.includes(l)} onChange={(e) => set({ languages: e.target.checked ? [...draft.languages, l] : draft.languages.filter((x) => x !== l) })} />
                    {t(`growth.widget.${l}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">{t("growth.widget.doctors")}</legend>
              <p className="text-xs text-muted-foreground">{draft.doctorIds.length === 0 ? t("growth.widget.allDoctors") : null}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {(profile?.doctors ?? []).map((d) => (
                  <label key={d.clinicianId} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={draft.doctorIds.includes(d.clinicianId)} onChange={(e) => set({ doctorIds: e.target.checked ? [...draft.doctorIds, d.clinicianId] : draft.doctorIds.filter((x) => x !== d.clinicianId) })} />
                    {isAr ? d.nameAr : d.nameEn}
                  </label>
                ))}
              </div>
            </fieldset>
          </fieldset>
          {serverError ? <p role="alert" className="text-sm text-destructive" data-testid="widget-server-error">{serverError}</p> : null}
          {canEdit ? <Button type="submit" disabled={invalid || put.isPending} data-testid="widget-save">{t("growth.widget.save")}</Button> : null}
        </form>
        {w.snippets ? (
          <div className="space-y-3 border-t pt-4" data-testid="widget-snippets">
            <h3 className="text-sm font-semibold">{t("growth.widget.snippet")}</h3>
            <CopyBlock label={t("growth.widget.script")} value={w.snippets.script} testId="snippet-script" />
            <CopyBlock label={t("growth.widget.iframe")} value={w.snippets.iframe} testId="snippet-iframe" />
            <p className="text-xs text-muted-foreground">{t("growth.widget.proposedHost")}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
