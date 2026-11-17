import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { apiUrl } from "@/lib/api-url";

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const usePhone = !token;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = usePhone
        ? { phone, code, newPassword: password }
        : { token, newPassword: password };
      const res = await fetch(apiUrl("/api/v1/auth/password/reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? t("auth.reset.error"));
      navigate("/login", { replace: true, state: { resetOk: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.reset.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("auth.reset.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void submit(e)}>
            {usePhone ? (
              <>
                <Label htmlFor="phone">{t("signup.phone")}</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                <Label htmlFor="code">{t("signup.otp")}</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required />
              </>
            ) : null}
            <Label htmlFor="new-password">{t("auth.reset.newPassword")}</Label>
            <PasswordInput id="new-password" value={password} onChange={setPassword} />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={busy || password.length < 8}>
              {t("auth.reset.submit")}
            </Button>
            <p className="text-center text-sm">
              <Link to="/login" className="underline">
                {t("signup.backToLogin")}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}