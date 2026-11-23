import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/http";
import { resolvePostLoginPath } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";
import { useKiorexConfig } from "@/features/auth/use-kiorex-config";

type Session = { accessToken: string; refreshToken?: string; user: Parameters<ReturnType<typeof useAuthStore.getState>["setSession"]>[1] };
type CallbackResult =
  | { status: "SESSION"; session: Session }
  | { status: "MFA_REQUIRED"; ticket: string; mfaWhatsApp: boolean }
  | { status: "LINK_REQUIRED" }
  | { status: "LINKED" };

/** KCV-201 — hidden unless the API has KIOREX_OIDC_ISSUER configured (and account.provider_sso is not OFF). */
export function KiorexPassportButton() {
  const { t } = useTranslation();
  const { data } = useKiorexConfig();
  const [busy, setBusy] = useState(false);
  if (!data?.enabled) return null;
  return (
    <Button
      type="button"
      // KNED / ADR-031: "Sign in with Kiorex Passport" is the default (primary) action in the Nurse edition; the password form stays below it.
      variant={data.defaultSignIn === "KIOREX_PASSPORT" ? "default" : "outline"}
      className="w-full"
      data-testid="kiorex-passport-button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await apiPost<{ authorizationUrl: string }>("/api/v1/auth/kiorex/start", {});
          window.location.assign(r.authorizationUrl);
        } catch (e) {
          setBusy(false);
          toast.error(e instanceof Error ? e.message : t("kiorex.passport.failed"));
        }
      }}
    >
      {t("kiorex.passport.signIn")}
    </Button>
  );
}

export function KiorexCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const callbackMissingParams = !params.get("code") || !params.get("state");
  const [state, setState] = useState<"working" | "mfa" | "link-required" | "linked" | "error">(
    callbackMissingParams ? "error" : "working",
  );
  const [ticket, setTicket] = useState("");
  const [mfa, setMfa] = useState("");
  const [message, setMessage] = useState<string | null>(() =>
    callbackMissingParams
      ? (params.get("error_description") ?? params.get("error") ?? t("kiorex.passport.failed"))
      : null,
  );
  const started = useRef(false);

  function finish(res: CallbackResult) {
    if (res.status === "SESSION") {
      setSession(res.session.accessToken, res.session.user, res.session.refreshToken);
      const { user } = useAuthStore.getState();
      navigate(resolvePostLoginPath(user?.role, user?.navTabKeys, undefined, user?.roleNavTabKeys), { replace: true });
    } else if (res.status === "MFA_REQUIRED") {
      setTicket(res.ticket);
      setState("mfa");
    } else if (res.status === "LINK_REQUIRED") setState("link-required");
    else setState("linked");
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get("code");
    const st = params.get("state");
    if (!code || !st) return;
    apiPost<CallbackResult>("/api/v1/auth/kiorex/callback", { code, state: st, iss: params.get("iss") ?? undefined })
      .then(finish)
      .catch((e: unknown) => {
        setMessage(e instanceof Error ? e.message : t("kiorex.passport.failed"));
        setState("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md" data-testid="kiorex-callback">
        <CardHeader>
          <CardTitle>{t("kiorex.passport.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {state === "working" ? <p>{t("common.loading")}</p> : null}
          {state === "error" ? (
            <>
              <p className="text-destructive">{message}</p>
              <Link className="underline" to="/login">{t("kiorex.passport.backToLogin")}</Link>
            </>
          ) : null}
          {state === "link-required" ? (
            <>
              <p>{t("kiorex.passport.linkRequired")}</p>
              <Link className="underline" to="/login">{t("kiorex.passport.backToLogin")}</Link>
            </>
          ) : null}
          {state === "linked" ? (
            <>
              <p>{t("kiorex.passport.linked")}</p>
              <Link className="underline" to="/profile">{t("kiorex.passport.backToProfile")}</Link>
            </>
          ) : null}
          {state === "mfa" ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                apiPost<CallbackResult>("/api/v1/auth/kiorex/complete", { ticket, mfaCode: mfa })
                  .then(finish)
                  .catch((err: unknown) => setMessage(err instanceof Error ? err.message : t("kiorex.passport.failed")));
              }}
            >
              <Label htmlFor="kx-mfa">{t("auth.mfaPlaceholder")}</Label>
              <Input id="kx-mfa" inputMode="numeric" value={mfa} onChange={(e) => setMfa(e.target.value.replace(/\D/g, ""))} />
              {message ? <p className="text-destructive">{message}</p> : null}
              <Button type="submit">{t("auth.signIn")}</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/** Profile → explicit link / unlink with password re-authentication (never auto-merge). */
export function KiorexLinkPanel() {
  const { t } = useTranslation();
  const { data, refetch } = useQuery({
    queryKey: ["auth", "kiorex", "link"],
    queryFn: () => apiGet<{ enabled: boolean; linked: boolean; linkedAt: string | null }>("/api/v1/auth/kiorex/link"),
    retry: false,
  });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data?.enabled) return null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("kiorex.passport.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="kiorex-link-panel">
      <CardHeader>
        <CardTitle className="text-base">{t("kiorex.passport.title")}</CardTitle>
        <CardDescription>{data.linked ? t("kiorex.passport.isLinked") : t("kiorex.passport.linkHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="kx-link-pw">{t("kiorex.passport.confirmPassword")}</Label>
          <PasswordInput id="kx-link-pw" value={password} onChange={(v) => setPassword(v)} autoComplete="current-password" />
        </div>
        {data.linked ? (
          <Button
            variant="outline"
            disabled={busy || !password}
            onClick={() =>
              void run(async () => {
                await apiPost("/api/v1/auth/kiorex/link/remove", { password });
                setPassword("");
                await refetch();
              })
            }
          >
            {t("kiorex.passport.unlink")}
          </Button>
        ) : (
          <Button
            disabled={busy || !password}
            onClick={() =>
              void run(async () => {
                const r = await apiPost<{ authorizationUrl: string }>("/api/v1/auth/kiorex/link/start", { password });
                window.location.assign(r.authorizationUrl);
              })
            }
          >
            {t("kiorex.passport.link")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
