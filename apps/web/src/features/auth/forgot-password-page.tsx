import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/api-url";

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const body = mode === "email" ? { email } : { phone };
      const res = await fetch(apiUrl("/api/v1/auth/password/forgot"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { message?: string; devResetLink?: string };
      if (!res.ok) throw new Error(data.message ?? t("auth.forgot.error"));
      setMsg(
        data.devResetLink && import.meta.env.DEV
          ? t("auth.forgot.devLink", { link: data.devResetLink })
          : t("auth.forgot.sent"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.forgot.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle as="h1">{t("auth.forgot.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void submit(e)}>
            <div className="flex gap-2">
              <Button type="button" variant={mode === "email" ? "default" : "outline"} onClick={() => setMode("email")}>
                {t("auth.email")}
              </Button>
              <Button type="button" variant={mode === "phone" ? "default" : "outline"} onClick={() => setMode("phone")}>
                {t("signup.phone")}
              </Button>
            </div>
            {mode === "email" ? (
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="phone">{t("signup.phone")}</Label>
                <Input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {msg ? <p className="text-sm text-muted-foreground break-all">{msg}</p> : null}
            <Button className="w-full" type="submit" disabled={busy}>
              {t("auth.forgot.submit")}
            </Button>
            <p className="text-center text-sm">
              <Link to="/login" className="underline">
                {t("signup.backToLogin")}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}