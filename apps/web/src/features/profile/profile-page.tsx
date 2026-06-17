import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatUserRole } from "@/lib/locale-display";
import { ApiError, apiPatch } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";

export function ProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErr, setPasswordErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initials = user?.displayName
    ? user.displayName
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordErr(null);

    if (newPassword.length < 8) {
      setPasswordErr(t("profile.passwordMinLength", "New password must be at least 8 characters."));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErr(t("profile.passwordMismatch", "New password and confirmation do not match."));
      return;
    }

    setSubmitting(true);
    try {
      await apiPatch("/api/v1/auth/me/password", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(t("profile.passwordChanged", "Password updated successfully."));
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("common.error");
      setPasswordErr(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("profile.title")}</h1>
        <p className="text-muted-foreground">{t("profile.subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start gap-4 space-y-0">
          <div
            className="flex size-20 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted text-lg font-semibold"
            aria-hidden
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-xl leading-tight">{user?.displayName ?? "—"}</CardTitle>
            <CardDescription className="break-all">{user?.email}</CardDescription>
            <p className="text-xs text-muted-foreground">
              {t("profile.roleLabel")}: <span>{user?.role ? formatUserRole(user.role, t) : "—"}</span>
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">{t("profile.about")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("profile.aboutPlaceholder")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("profile.changePasswordTitle", "Change password")}</CardTitle>
          <CardDescription>
            {t("profile.changePasswordHint", "Update the password you use to sign in to this account.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void handleChangePassword(e)}>
            {passwordErr ? <p className="text-sm text-destructive">{passwordErr}</p> : null}
            <div className="space-y-2">
              <Label htmlFor="profile-current-password" required>
                {t("profile.currentPassword", "Current password")}
              </Label>
              <PasswordInput
                id="profile-current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-new-password" required>
                {t("profile.newPassword", "New password")}
              </Label>
              <PasswordInput
                id="profile-new-password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-confirm-password" required>
                {t("profile.confirmPassword", "Confirm new password")}
              </Label>
              <PasswordInput
                id="profile-confirm-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={submitting || !currentPassword || !newPassword || !confirmPassword}>
              {submitting ? t("common.loading") : t("profile.updatePassword", "Update password")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
