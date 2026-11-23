import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPut } from "@/lib/http";

type Choice = "AUTO" | "PASSPORT" | "PASSWORD";
interface SignInSettings { defaultSignInMethod: "PASSWORD" | "PASSPORT" | null; effectiveSignInMethod: "PASSWORD" | "PASSPORT"; linkedToKiorex: boolean }

/** Org default sign-in method (ADR-038 amendment): which method the login page preselects. Both methods stay available. Group admin (org owner) only. */
export function OrgSignInDefaultCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin", "sign-in-method"], queryFn: () => apiGet<SignInSettings>("/api/v1/admin/sign-in-method") });
  const [local, setLocal] = useState<Choice | null>(null);
  const stored: Choice = data?.defaultSignInMethod ?? "AUTO";
  const value = local ?? stored;
  const save = useMutation({
    mutationFn: (v: "PASSWORD" | "PASSPORT" | null) => apiPut<SignInSettings>("/api/v1/admin/sign-in-method", { defaultSignInMethod: v }),
    onSuccess: async () => { setLocal(null); await qc.invalidateQueries({ queryKey: ["admin", "sign-in-method"] }); toast.success(t("admin.signinSaved")); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const method = (m: string) => t(m === "PASSPORT" ? "admin.signinPassport" : "admin.signinPassword");
  return (
    <Card data-testid="signin-default-card">
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-base">{t("admin.signinTitle")}</CardTitle>
        <CardDescription>{t("admin.signinHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div role="radiogroup" aria-label={t("admin.signinTitle")} className="grid gap-2 sm:grid-cols-3">
          {(["AUTO", "PASSPORT", "PASSWORD"] as const).map((c) => (
            <label key={c} className={`flex min-h-12 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${value === c ? "border-primary bg-accent" : "border-border"}`}>
              <input type="radio" name="defaultSignInMethod" value={c} data-testid={`signin-default-${c.toLowerCase()}`} checked={value === c} onChange={() => setLocal(c)} className="mt-0.5" />
              <span><span className="block font-medium">{c === "AUTO" ? t("admin.signinAuto") : method(c)}</span>{c === "AUTO" ? <span className="block text-xs text-muted-foreground">{t("admin.signinAutoHint")}</span> : null}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground" data-testid="signin-default-effective">{data ? `${t("admin.signinEffective", { method: method(data.effectiveSignInMethod) })} · ${data.linkedToKiorex ? t("admin.signinLinked") : t("admin.signinNotLinked")}` : ""}</p>
        <Button type="button" disabled={local === null || local === stored || save.isPending} data-testid="signin-default-save" onClick={() => save.mutate(value === "AUTO" ? null : value)}>{t("common.save", "Save")}</Button>
      </CardContent>
    </Card>
  );
}
