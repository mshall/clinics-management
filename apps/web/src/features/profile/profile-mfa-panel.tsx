import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { apiPost } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";

export function ProfileMfaPanel() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const refreshSessionFromServer = useAuthStore((s) => s.refreshSessionFromServer);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [qrImage, setQrDataUrl] = useState<string | null>(null);
  const qrDataUrl = otpauthUrl ? qrImage : null;
  const [setupCode, setSetupCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!otpauthUrl) return;
    void QRCode.toDataURL(otpauthUrl, { margin: 2, width: 200 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [otpauthUrl]);

  async function beginSetup() {
    setBusy(true);
    try {
      const res = await apiPost<{ secret: string; otpauthUrl: string }>("/api/v1/auth/mfa/setup", {});
      setSecret(res.secret);
      setOtpauthUrl(res.otpauthUrl);
      setRecoveryCodes(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      toast.success(t("profile.mfaSecretCopied", "Secret copied to clipboard."));
    } catch {
      toast.error(t("common.error", "Error"));
    }
  }

  async function confirmSetup() {
    if (!secret) return;
    setBusy(true);
    try {
      const res = await apiPost<{ ok: true; recoveryCodes: string[] }>("/api/v1/auth/mfa/confirm", {
        secret,
        code: setupCode,
      });
      setRecoveryCodes(res.recoveryCodes);
      setSecret(null);
      setOtpauthUrl(null);
      setQrDataUrl(null);
      setSetupCode("");
      await refreshSessionFromServer();
      toast.success(t("profile.mfaEnabled", "Authenticator MFA enabled."));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa() {
    setBusy(true);
    try {
      await apiPost("/api/v1/auth/mfa/disable", { password: disablePassword, code: disableCode });
      setDisablePassword("");
      setDisableCode("");
      await refreshSessionFromServer();
      toast.success(t("profile.mfaDisabled", "MFA disabled."));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function regenerateRecovery() {
    setBusy(true);
    try {
      const res = await apiPost<{ recoveryCodes: string[] }>("/api/v1/auth/mfa/recovery/regenerate", {
        password: disablePassword,
        code: disableCode,
      });
      setRecoveryCodes(res.recoveryCodes);
      toast.success(t("profile.mfaRecoveryRegenerated", "New recovery codes issued. Store them securely."));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("profile.mfaTitle", "Multi-factor authentication")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          {user?.mfaEnabled
            ? t("profile.mfaStatusOn", "MFA is on. Use your authenticator app or a one-time recovery code at sign-in.")
            : t("profile.mfaStatusOff", "Protect your account with a TOTP authenticator app.")}
        </p>
        {recoveryCodes?.length ? (
          <div className="rounded-md border border-[hsl(var(--warning)/0.4)] bg-amber-500/10 p-3">
            <p className="font-medium">{t("profile.mfaRecoverySave", "Save these recovery codes (shown once):")}</p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs ltr-nums">
              {recoveryCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {!user?.mfaEnabled && !secret ? (
          <Button type="button" disabled={busy} onClick={() => void beginSetup()}>
            {t("profile.mfaBegin", "Set up authenticator")}
          </Button>
        ) : null}
        {secret ? (
          <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium">{t("profile.mfaScanQr", "1. Scan this QR code in your authenticator app")}</p>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={t("profile.mfaQrAlt", "Authenticator QR code")}
                className="mx-auto rounded-md border bg-white p-2"
                width={200}
                height={200}
              />
            ) : (
              <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("profile.mfaManualHint", "Cannot scan? Copy the secret key and enter it manually in your app.")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-background px-2 py-1 font-mono text-xs ltr-nums">{secret}</code>
              <Button type="button" size="sm" variant="outline" onClick={() => void copySecret()}>
                {t("profile.mfaCopySecret", "Copy secret")}
              </Button>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">{t("profile.mfaEnterCode", "2. Enter the 6-digit code from the app")}</p>
              <Label htmlFor="mfa-setup-code" className="sr-only">
                {t("profile.mfaConfirmCode", "6-digit code")}
              </Label>
              <Input
                id="mfa-setup-code"
                className="w-40 ltr-nums"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            <Button type="button" disabled={busy || setupCode.length < 6} onClick={() => void confirmSetup()}>
              {t("profile.mfaConfirm", "Enable MFA")}
            </Button>
          </div>
        ) : null}
        {user?.mfaEnabled ? (
          <div className="space-y-2 border-t border-border pt-4">
            <Label>{t("auth.password")}</Label>
            <PasswordInput value={disablePassword} onChange={setDisablePassword} />
            <Label>{t("profile.mfaConfirmCode", "6-digit code")}</Label>
            <Input className="w-40 ltr-nums" value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="destructive" disabled={busy} onClick={() => void disableMfa()}>
                {t("profile.mfaDisable", "Disable MFA")}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void regenerateRecovery()}>
                {t("profile.mfaNewRecovery", "New recovery codes")}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}