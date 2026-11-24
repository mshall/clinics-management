import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPut } from "@/lib/http";
import "./kiorex-connect-i18n";

interface SignInSettings { defaultSignInMethod: "PASSWORD" | "PASSPORT" | null; effectiveSignInMethod: "PASSWORD" | "PASSPORT"; linkedToKiorex: boolean }

/** Once live, offer to make Kiorex Passport the default sign-in (the org-level setting) and to invite staff to link their phone. Hidden when the setting is not available. */
export function KiorexConnectPassportCard() {
  const { t } = useTranslation(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "sign-in-method"], queryFn: () => apiGet<SignInSettings>("/api/v1/admin/sign-in-method"), retry: false });
  const set = useMutation({ mutationFn: () => apiPut<SignInSettings>("/api/v1/admin/sign-in-method", { defaultSignInMethod: "PASSPORT" }), onSuccess: () => { toast.success(t("kiorexConnect.passport.done")); void qc.invalidateQueries({ queryKey: ["admin", "sign-in-method"] }); } });
  if (q.isError || !q.data) return null;
  const isPassport = q.data.effectiveSignInMethod === "PASSPORT";
  return (
    <Card data-testid="connect-passport">
      <CardHeader className="space-y-1.5"><CardTitle className="text-base">{t("kiorexConnect.passport.title")}</CardTitle><CardDescription>{t("kiorexConnect.passport.body")}</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {isPassport ? <span className="text-sm text-emerald-700 dark:text-emerald-400">{t("kiorexConnect.passport.done")}</span> : <Button disabled={set.isPending} onClick={() => set.mutate()} data-testid="connect-passport-set">{t("kiorexConnect.passport.set")}</Button>}
        <Button asChild variant="outline"><Link to="/team">{t("kiorexConnect.passport.invite")}</Link></Button>
      </CardContent>
    </Card>
  );
}
