import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BrandLockup } from "@/components/brand-lockup";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { KiorexPassportButton, startKiorexPassportSignIn } from "@/features/auth/kiorex-passport";
import { currentNavigationType, wantsPassportAutostart } from "@/lib/kiorly-home";
import { toast } from "sonner";
import { useKiorexConfig } from "@/features/auth/use-kiorex-config";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/api-url";
import { loginRequest } from "@/lib/auth-api";
import { resolvePostLoginPath } from "@/lib/nav-policy";
import { useAuthStore } from "@/stores/auth-store";

// DEV ONLY quick-pick test users. Keep the condition inline: Vite folds `import.meta.env.DEV` to false in production builds, which drops the
// dynamic import and the whole ../../dev folder (asserted by scripts/check-no-dev-test-users.mjs).
const DevTestUsers = import.meta.env.DEV && import.meta.env.VITE_DEV_TEST_USERS !== "false" ? lazy(() => import("@/dev/dev-test-users")) : null;

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfa, setMfa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiReady, setApiReady] = useState<boolean | null>(null);
  const [loginMode, setLoginMode] = useState<"email" | "phone">("email");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  // KNED: on the Nurse edition (nurse.kiorly.com) "Sign in with Kiorex Passport" is the primary action; the password form stays below it.
  const kx = useKiorexConfig();
  const nursePrimary = kx.data?.enabled === true && kx.data.defaultSignIn === "KIOREX_PASSPORT";
  // Kiorly Home sends `?sso=passport[&edition=NURSE]`: start "Sign in with Kiorex Passport" by itself (once per page load; the Passport SSO session makes it silent).
  const autostarted = useRef(false);
  useEffect(() => {
    if (user && token) return;
    if (autostarted.current || kx.data?.enabled !== true || !wantsPassportAutostart(location.search, currentNavigationType())) return;
    autostarted.current = true;
    startKiorexPassportSignIn().catch((e: unknown) => toast.error(e instanceof Error ? e.message : t("kiorex.passport.failed")));
  }, [user, token, kx.data?.enabled, location.search, t]);

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
      setSession(res.accessToken, res.user, res.refreshToken);
      const from = (location.state as { from?: string } | null)?.from;
      const { user: signedIn } = useAuthStore.getState();
      navigate(resolvePostLoginPath(signedIn?.role, signedIn?.navTabKeys, from, signedIn?.roleNavTabKeys), { replace: true });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Multi-factor")) {
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

  return (
    <div className="flex min-h-screen flex-col bg-linear-to-b from-background to-muted/60">
      <header className="flex items-center justify-between gap-3 px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
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
            <CardTitle>{t("auth.signIn")}</CardTitle>
          </CardHeader>
          <CardContent>
            {nursePrimary ? (
              <div className="mb-4 space-y-2" data-testid="nurse-login-primary">
                <KiorexPassportButton />
                <p className="text-center text-xs text-muted-foreground">{t("nurse.login.orEmail")}</p>
              </div>
            ) : null}
            <div className="mb-4 flex gap-2">
              <Button type="button" variant={loginMode === "email" ? "default" : "outline"} onClick={() => setLoginMode("email")}>
                {t("auth.email")}
              </Button>
              <Button type="button" variant={loginMode === "phone" ? "default" : "outline"} onClick={() => setLoginMode("phone")}>
                {t("auth.phoneLogin")}
              </Button>
            </div>
            {nursePrimary ? null : (
              <div className="mb-4">
                <KiorexPassportButton />
              </div>
            )}
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
              <div className="space-y-2">
                <Label htmlFor="mfa">{t("auth.mfaPlaceholder")}</Label>
                <Input
                  id="mfa"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfa}
                  onChange={(e) => setMfa(e.target.value.replace(/\D/g, ""))}
                  className="ltr-nums"
                  placeholder="123456"
                />
              </div>
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
          </CardContent>
        </Card>
        {DevTestUsers ? <Suspense fallback={null}><DevTestUsers busy={submitting} onPick={(e, p) => { setEmail(e); setPassword(p); void signInWith(e, p, ""); }} /></Suspense> : null}
      </div>
    </div>
  );
}
