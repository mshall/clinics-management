import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
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

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState("admin@drahmedshall.com");
  const [password, setPassword] = useState("demo");
  const [mfa, setMfa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiReady, setApiReady] = useState<boolean | null>(null);

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
    const to = resolvePostLoginPath(user.role, user.navTabKeys, from);
    return <Navigate to={to} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      void mfa;
      const res = await loginRequest(email, password);
      setSession(res.accessToken, res.user);
      const from = (location.state as { from?: string } | null)?.from;
      const { user: signedIn } = useAuthStore.getState();
      navigate(resolvePostLoginPath(signedIn?.role, signedIn?.navTabKeys, from), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.signIn"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted/60">
      <header className="flex items-center justify-between gap-3 px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-10 w-10 object-contain shadow-sm" width={40} height={40} />
          <div>
            <p className="text-sm font-semibold leading-tight">{t("app.name")}</p>
            <p className="text-xs text-muted-foreground">{t("app.tagline")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle>{t("auth.signIn")}</CardTitle>
          </CardHeader>
          <CardContent>
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
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
