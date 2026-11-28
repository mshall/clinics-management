import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "@/components/brand-lockup";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { startKiorexPassportSignIn } from "@/features/auth/kiorex-passport";
import { rememberSignInMethod } from "@/lib/sign-in-method";
import { UnifiedSignIn } from "@/components/unified-sign-in";
import { useSignInMethod } from "@/components/use-sign-in-method";
import { SwitchProductLink } from "@/components/switch-product-link";
import { KiorexLogo } from "@/brand/components/web/KiorexLogo";
import { KxBrandBackdrop } from "@/brand/components/web/KxBrandBackdrop";
import { Pulse } from "@/brand/ui-kit";
import { useNurseEditionDom } from "@/lib/use-nurse-edition-dom";
import { currentNavigationType, wantsPassportAutostart, readHandoff, withoutHandoff } from "@/lib/kiorly-home";
import { toast } from "sonner";
import { useKiorexConfig } from "@/features/auth/use-kiorex-config";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/api-url";
import { handoffExchangeRequest, loginRequest } from "@/lib/auth-api";
import { resolvePostLoginPath } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const nurse = useNurseEditionDom();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfa, setMfa] = useState("");
  const [showMfa, setShowMfa] = useState(false); // the code field appears when the server asks for it or the person says they use one
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiReady, setApiReady] = useState<boolean | null>(null);
  const [loginMode, setLoginMode] = useState<"email" | "phone">("email");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  // Two methods only: Kiorex Passport (default, on every edition) and Password; the last method that signed this browser in is preselected.
  // Passport availability comes from the API (`/auth/kiorex/config`); when it is not offered only the password form shows.
  const kx = useKiorexConfig();
  const sim = useSignInMethod(kx.isPending ? undefined : kx.data?.enabled === true, kx.data?.defaultMethod);
  // Kiorly Home sends `?sso=passport[&edition=NURSE]`: start "Sign in with Kiorex Passport" by itself (once per page load; the Passport SSO session makes it silent).
  const autostarted = useRef(false);
  // Kiorly Home password handoff: redeem the single-use code once, strip it from the address bar first, then adopt the normal session.
  const [handoff] = useState(() => readHandoff(window.location.search));
  const [handoffBusy, setHandoffBusy] = useState(!!handoff.code);
  const redeemed = useRef(false);
  useEffect(() => {
    if (!handoff.code && !handoff.reason) return;
    const edition = new URLSearchParams(window.location.search).get("edition") === "NURSE" ? "NURSE" : null;
    window.history.replaceState(window.history.state, "", withoutHandoff(window.location.pathname, window.location.search, window.location.hash));
    if (!handoff.code || redeemed.current) return;
    redeemed.current = true;
    handoffExchangeRequest(handoff.code, edition)
      .then((res) => {
        try { localStorage.removeItem("kiorly-passport-logout"); } catch { /* ignore */ }
        rememberSignInMethod("password");
        setSession(res.accessToken, res.user, res.refreshToken);
        const { user: signedIn } = useAuthStore.getState();
        navigate(resolvePostLoginPath(signedIn?.role, signedIn?.navTabKeys, undefined, signedIn?.roleNavTabKeys), { replace: true });
      })
      .catch(() => { setHandoffBusy(false); setError(t("auth.handoffFailed")); });
  }, [handoff, setSession, navigate, t]);

  // the handoff could not complete (second factor, expired password, organisation): show the product's own password form
  useEffect(() => { if (handoff.reason && sim.ready) sim.choose("password"); }, [handoff.reason, sim.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user && token) return;
    if (handoff.code || autostarted.current || kx.data?.enabled !== true || !wantsPassportAutostart(location.search, currentNavigationType())) return;
    autostarted.current = true;
    startKiorexPassportSignIn().catch((e: unknown) => toast.error(e instanceof Error ? e.message : t("kiorex.passport.failed")));
  }, [user, token, kx.data?.enabled, location.search, t, handoff.code]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function ping() {
      try {
        const res = await fetch(apiUrl("/api/v1/health/live"), { method: "GET" });
        if (cancelled) return;
        setApiReady(res.ok);
        if (!res.ok) timer = setTimeout(() => void ping(), 3000);
      } catch {
        if (cancelled) return;
        setApiReady(false);
        timer = setTimeout(() => void ping(), 3000);
      }
    }

    void ping();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (user && token) {
    const from = (location.state as { from?: string } | null)?.from;
    const to = resolvePostLoginPath(user.role, user.navTabKeys, from, user.roleNavTabKeys);
    return <Navigate to={to} replace />;
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await signInWith(email, password, mfa);
  }

  async function signInWith(emailValue: string, passwordValue: string, mfaValue: string) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await loginRequest(emailValue, passwordValue, mfaValue);
      try { localStorage.removeItem("kiorly-passport-logout"); } catch { /* ignore */ } // a password session never ends the Passport session
      rememberSignInMethod("password");
      setSession(res.accessToken, res.user, res.refreshToken);
      const from = (location.state as { from?: string } | null)?.from;
      const { user: signedIn } = useAuthStore.getState();
      navigate(resolvePostLoginPath(signedIn?.role, signedIn?.navTabKeys, from, signedIn?.roleNavTabKeys), { replace: true });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Multi-factor")) {
        setShowMfa(true);
        setError(t("auth.mfaRequired", "Enter the 6-digit code from your authenticator app."));
      } else {
        setError(err instanceof Error ? err.message : t("auth.signIn"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePhoneLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (!otp.trim()) {
        await fetch(apiUrl("/api/v1/auth/otp/request"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        }).then(async (r) => {
          if (!r.ok) {
            const d = (await r.json().catch(() => ({}))) as { message?: string };
            throw new Error(d.message ?? t("auth.otp.requestFailed"));
          }
        });
        setError(t("auth.otp.sent"));
        return;
      }
      const res = await fetch(apiUrl("/api/v1/auth/otp/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ phone, code: otp, ...(mfa.trim() ? { mfaCode: mfa } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { message?: string }).message ?? t("auth.signIn"));
      try { localStorage.removeItem("kiorly-passport-logout"); } catch { /* ignore */ }
      rememberSignInMethod("password");
      setSession(data.accessToken, data.user, data.refreshToken);
      const from = (location.state as { from?: string } | null)?.from;
      const { user: signedIn } = useAuthStore.getState();
      navigate(resolvePostLoginPath(signedIn?.role, signedIn?.navTabKeys, from, signedIn?.roleNavTabKeys), {
        replace: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.signIn"));
    } finally {
      setSubmitting(false);
    }
  }

  const hero = nurse ? "authHeroNurse" : "authHero";
  const points = ["a", "b", "c"] as const;
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]" data-testid="login-split">
      <aside className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:sticky lg:top-0 lg:flex lg:h-screen" data-testid="login-brand-panel">
        <KxBrandBackdrop />
        <div className="relative w-fit"><KiorexLogo variant="lockup" product={nurse ? "nurse" : "clinic"} lang={i18n.language} tone="inverse" height={48} /><p data-kx-tagline className="mt-1 text-xs text-white/70">{t("app.tagline")}</p></div>
        <div className="relative max-w-md space-y-6">
          <h2 className="text-balance text-3xl font-semibold leading-tight">{t(`auth.${hero}.headline`)}</h2>
          <ul className="space-y-4">
            {points.map((k) => <li key={k} className="flex items-start gap-3 text-sm text-white/90"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-(--kx-coral-500,#E8735E)" />{t(`auth.${hero}.${k}`)}</li>)}
          </ul>
        </div>
        <div className="relative text-xs text-white/75"><Pulse size={16} loop /> <span className="ms-2">{t(`auth.${hero}.foot`)}</span></div>
      </aside>
      <main id="main" className="flex min-h-screen flex-col bg-linear-to-b from-background to-muted/60">
      <header className="flex items-center justify-between gap-3 px-4 py-4 md:px-8">
        <div className="flex items-center gap-3 lg:invisible">
          <BrandLockup height={40} />
        </div>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle as="h1">{t("auth.signIn")}</CardTitle>
          </CardHeader>
          <CardContent>
            {handoffBusy ? <p role="status" data-testid="handoff-busy" className="mb-4 text-sm text-muted-foreground">{t("auth.handoffBusy")}</p> : null}
            {handoff.reason ? <p role="status" data-testid="handoff-reason" className="mb-4 rounded-lg border border-border bg-muted/50 p-3 text-sm">{t(`auth.handoffReason.${handoff.reason}`, { defaultValue: t("auth.handoffReason.other") })}</p> : null}
            <UnifiedSignIn
              lang={i18n.language.startsWith("ar") ? "ar" : "en"}
              loading={!sim.ready}
              passport={{ available: sim.offered, onStart: () => { startKiorexPassportSignIn().catch((e: unknown) => toast.error(e instanceof Error ? e.message : t("kiorex.passport.failed"))); } }}
              local={{ enabled: true, onSubmit: async () => undefined }}
              localSlot={
              <div>
                <div className="mb-4 flex gap-2">
                  <Button type="button" variant={loginMode === "email" ? "default" : "outline"} onClick={() => setLoginMode("email")}>
                    {t("auth.email")}
                  </Button>
                  <Button type="button" variant={loginMode === "phone" ? "default" : "outline"} onClick={() => setLoginMode("phone")}>
                    {t("auth.phoneLogin")}
                  </Button>
                </div>
            {loginMode === "email" ? (
            <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
              {apiReady === false ? (
                <p className="text-sm text-muted-foreground">
                  {import.meta.env.DEV
                    ? "Waiting for the local API — run `npm run dev` from the repo root if this persists."
                    : t("auth.apiStarting", "The server is starting up. Sign-in will be available in a moment.")}
                </p>
              ) : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <div className="space-y-2">
                <Label htmlFor="email" required>{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" required>{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {showMfa ? (
                <div className="space-y-2">
                  <Label htmlFor="mfa">{t("auth.mfaPlaceholder")}</Label>
                  <Input
                    id="mfa"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    value={mfa}
                    onChange={(e) => setMfa(e.target.value.replace(/\D/g, ""))}
                    className="ltr-nums tracking-[0.3em]"
                    aria-describedby="mfa-hint"
                  />
                  <p id="mfa-hint" className="text-xs text-muted-foreground">{t("auth.mfaHint")}</p>
                </div>
              ) : (
                <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => setShowMfa(true)}>
                  {t("auth.mfaToggle")}
                </button>
              )}
              <Button type="submit" className="w-full" disabled={submitting || apiReady === false}>
                {submitting ? t("common.loading") : t("auth.signIn")}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/forgot-password" className="underline">
                  {t("auth.forgotPassword")}
                </Link>
                {" · "}
                <Link to="/signup" className="underline">
                  {t("auth.startSignup")}
                </Link>
              </p>
            </form>
            ) : (
              <form className="space-y-4" onSubmit={(e) => void handlePhoneLogin(e)}>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("signup.phone")}</Label>
                  <Input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otp">{t("signup.otp")}</Label>
                  <Input id="otp" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder={t("auth.otp.optionalHint")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mfa-phone">{t("auth.mfaPlaceholder")}</Label>
                  <Input id="mfa-phone" inputMode="numeric" maxLength={6} value={mfa} onChange={(e) => setMfa(e.target.value.replace(/\D/g, ""))} />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button type="submit" className="w-full" disabled={submitting || apiReady === false}>
                  {submitting ? t("common.loading") : otp ? t("auth.signIn") : t("auth.otp.sendCode")}
                </Button>
              </form>
            )}
              </div>
              }
            />
          </CardContent>
        </Card>
        <p className="mt-4 text-center"><SwitchProductLink /></p>
      </div>
      </main>
    </div>
  );
}
