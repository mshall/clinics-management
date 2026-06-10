import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [email, setEmail] = useState("physician@kiorly.com");
  const [password, setPassword] = useState("demo");
  const [mfa, setMfa] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
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
                <Label htmlFor="password">{t("auth.password")}</Label>
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
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("common.loading") : t("auth.signIn")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
