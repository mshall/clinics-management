import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/brand/ui-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GrowthAccess } from "./growth-api";
import { useB2bReferrals, useCreateB2b } from "./b2b-api";
import { b2bErrorCode, b2bProblem, SIZE_BUCKETS } from "./b2b-logic";
import "./b2b-i18n";

/** "Refer a company" (GRW-P4-C): company name, a size bucket and the provider's OWN opaque contact reference. Tracking only: no reward, credit or fee share. */
export function B2bReferral({ clinicId, access }: { clinicId: string; access: GrowthAccess }) {
  const { t, i18n } = useTranslation();
  const list = useB2bReferrals(); const create = useCreateB2b(); const id = useId();
  const [name, setName] = useState(""); const [size, setSize] = useState<string>("UNKNOWN"); const [ref, setRef] = useState(""); const [error, setError] = useState<string | null>(null);
  const canSend = access.level === "admin" || access.level === "marketing";
  const locale = i18n.language.startsWith("ar") ? "ar-EG" : "en";
  const submit = async () => {
    setError(null);
    const p = b2bProblem({ companyName: name, contactRef: ref });
    if (p) { setError(t(`growth.b2b.problem.${p}`)); return; }
    try { await create.mutateAsync({ clinicId, companyName: name.trim(), sizeBucket: size, ...(ref.trim() ? { contactRef: ref.trim() } : {}) }); toast.success(t("growth.b2b.sent")); setName(""); setRef(""); }
    catch (e) { const c = b2bErrorCode(e); setError(c && i18n.exists(`growth.b2b.error.${c}`) ? t(`growth.b2b.error.${c}`) : t("growth.b2b.error.GENERIC")); }
  };
  return (
    <Card data-testid="b2b-referral">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Building2 className="size-4" aria-hidden />{t("growth.b2b.title")}</CardTitle>
        <CardDescription>{t("growth.b2b.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-lg border p-3 text-sm" data-testid="b2b-no-reward">{t("growth.b2b.noReward")}</p>
        {canSend ? (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate data-testid="b2b-form">
            <div className="space-y-1.5"><Label htmlFor={`${id}-n`}>{t("growth.b2b.name")}</Label><Input id={`${id}-n`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-describedby={`${id}-nh`} data-testid="b2b-name" /><p id={`${id}-nh`} className="text-xs text-muted-foreground">{t("growth.b2b.nameHint")}</p></div>
            <div className="space-y-1.5"><Label htmlFor={`${id}-s`}>{t("growth.b2b.size")}</Label><select id={`${id}-s`} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={size} onChange={(e) => setSize(e.target.value)}>{SIZE_BUCKETS.map((s) => <option key={s} value={s}>{t(`growth.b2b.sizes.${s}`)}</option>)}</select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${id}-r`}>{t("growth.b2b.contactRef")}</Label><Input id={`${id}-r`} dir="ltr" value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} aria-describedby={`${id}-rh`} data-testid="b2b-ref" /><p id={`${id}-rh`} className="text-xs text-muted-foreground">{t("growth.b2b.contactHint")}</p></div>
            {error ? <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2" data-testid="b2b-error">{error}</p> : null}
            <div className="sm:col-span-2"><Button type="submit" disabled={create.isPending} data-testid="b2b-send">{t("growth.b2b.send")}</Button></div>
          </form>) : null}
        <section aria-labelledby={`${id}-l`} className="space-y-2">
          <h3 id={`${id}-l`} className="text-sm font-semibold">{t("growth.b2b.listTitle")}</h3>
          {list.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("growth.b2b.loading")}</p> : null}
          {list.isError ? <EmptyState tone="error" compact title={t("growth.b2b.loadError")} action={<Button size="sm" variant="outline" onClick={() => void list.refetch()}>{t("growth.b2b.retry")}</Button>} /> : null}
          {list.data && !list.data.items.length ? <p className="text-sm text-muted-foreground" data-testid="b2b-empty">{t("growth.b2b.empty")}</p> : null}
          {list.data?.items.length ? (
            <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="b2b-table"><caption className="sr-only">{t("growth.b2b.listTitle")}</caption>
              <thead><tr className="text-start text-muted-foreground"><th scope="col" className="p-2 text-start">{t("growth.b2b.colCompany")}</th><th scope="col" className="p-2 text-start">{t("growth.b2b.colSize")}</th><th scope="col" className="p-2 text-start">{t("growth.b2b.colStatus")}</th><th scope="col" className="p-2 text-start">{t("growth.b2b.colDate")}</th></tr></thead>
              <tbody>{list.data.items.map((r) => <tr key={r.id} className="border-t"><td className="p-2 font-medium">{r.companyName}</td><td className="p-2">{t(`growth.b2b.sizes.${r.sizeBucket}`)}</td><td className="p-2">{t(`growth.b2b.status.${r.status}`)}</td><td className="p-2">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(r.createdAt))}</td></tr>)}</tbody></table></div>) : null}
        </section>
      </CardContent>
    </Card>
  );
}
