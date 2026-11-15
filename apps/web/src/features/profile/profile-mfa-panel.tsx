import { useState } from "react";
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
  const [setupCode, setSetupCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [busy, setBusy] = useState(false);

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
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
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
          <div className="space-y-2">
            <p className="text-xs break-all">{otpauthUrl}</p>
            <p className="text-xs text-muted-foreground">{t("profile.mfaManualSecret", "Manual secret:")} {secret}</p>
            <Label htmlFor="mfa-setup-code">{t("profile.mfaConfirmCode", "6-digit code")}</Label>
            <Input id="mfa-setup-code" className="w-40 ltr-nums" value={setupCode} onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <Button type="button" disabled={busy || setupCode.length < 6} onClick={() => void confirmSetup()}>
              {t("profile.mfaConfirm", "Enable MFA")}
            </Button>
          </div>
        ) : null}
        {user?.mfaEnabled ? (
          <div className="space-y-2 border-t border-border pt-4">
            <Label>{t("auth.password")}</Label>
            <PasswordInput value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} />
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