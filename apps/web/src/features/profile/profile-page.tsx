import { Camera, KeyRound, LayoutGrid, Mail, Shield } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { PasswordInput } from "@/components/password-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enhanceImageFile } from "@/lib/enhance-image";
import { formatUserRole } from "@/lib/locale-display";
import { ApiError, apiPatch, apiPostFormData } from "@/lib/http";
import { avatarGradient, profileInitials } from "@/lib/profile-avatar";
import { useAuthenticatedImage } from "@/lib/use-authenticated-image";
import { useAuthStore } from "@/stores/auth-store";

export function ProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setHasAvatar = useAuthStore((s) => s.setHasAvatar);
  const refreshSessionFromServer = useAuthStore((s) => s.refreshSessionFromServer);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErr, setPasswordErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [avatarVersion, setAvatarVersion] = useState(0);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState("avatar.jpg");
  const [cropContentType, setCropContentType] = useState<string | undefined>();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarApiPath = user?.hasAvatar ? `/api/v1/auth/me/avatar?v=${avatarVersion}` : null;
  const { url: avatarUrl, loading: avatarLoading } = useAuthenticatedImage(avatarApiPath, Boolean(user?.hasAvatar));

  const initials = profileInitials(user?.displayName);
  const coverStyle = useMemo(
    () => ({ background: avatarGradient(user?.email ?? user?.id ?? "profile") }),
    [user?.email, user?.id],
  );
  const avatarStyle = useMemo(
    () => ({ background: avatarGradient(user?.displayName ?? user?.id ?? "avatar") }),
    [user?.displayName, user?.id],
  );

  const moduleCount = user?.navTabKeys?.length;
  const modulesLabel =
    moduleCount != null
      ? String(moduleCount)
      : t("profile.statModulesFull", "Full");

  function resetPasswordForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordErr(null);
  }

  function closePasswordDialog() {
    setPasswordOpen(false);
    resetPasswordForm();
  }

  function clearCropState() {
    if (cropImageUrl) URL.revokeObjectURL(cropImageUrl);
    setCropImageUrl(null);
    setCropOpen(false);
  }

  async function handleAvatarFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("profile.avatarImageOnly", "Please choose an image file."));
      return;
    }
    clearCropState();
    setCropFileName(file.name || "avatar.jpg");
    setCropContentType(file.type);
    setCropImageUrl(URL.createObjectURL(file));
    setCropOpen(true);
  }

  async function applyAvatarCrop(file: File) {
    setAvatarUploading(true);
    try {
      const enhanced = await enhanceImageFile(file, "avatar");
      const fd = new FormData();
      fd.append("file", enhanced);
      await apiPostFormData("/api/v1/auth/me/avatar", fd, { enhance: false });
      setHasAvatar(true);
      setAvatarVersion((v) => v + 1);
      await refreshSessionFromServer();
      clearCropState();
      toast.success(t("profile.avatarUpdated", "Profile picture updated."));
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("common.error");
      toast.error(msg);
    } finally {
      setAvatarUploading(false);
    }
  }

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
      toast.success(t("profile.passwordChanged", "Password updated successfully."));
      closePasswordDialog();
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
    <>
      <div className="mx-auto w-full max-w-3xl space-y-4 pb-8">
        <Card className="overflow-hidden border-border/80 shadow-sm">
          <div className="relative h-36 sm:h-44" style={coverStyle} aria-hidden>
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent" />
          </div>

          <CardContent className="relative px-4 pb-6 pt-0 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="-mt-14 flex flex-col gap-3 sm:-mt-16 sm:flex-row sm:items-end">
                <div className="relative shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={user?.displayName ?? t("profile.avatarAlt", "Profile picture")}
                      className="size-28 rounded-full border-4 border-card object-cover shadow-lg sm:size-32"
                    />
                  ) : (
                    <div
                      className="flex size-28 shrink-0 items-center justify-center rounded-full border-4 border-card text-3xl font-bold text-white shadow-lg sm:size-32"
                      style={avatarStyle}
                      aria-hidden
                    >
                      {avatarLoading && user?.hasAvatar ? "…" : initials}
                    </div>
                  )}
                  <label
                    className="absolute bottom-1 end-1 cursor-pointer rounded-full border border-border bg-background p-2 shadow-sm transition-colors hover:bg-muted"
                    title={t("profile.changeAvatar", "Change profile picture")}
                  >
                    <Camera className="size-4" aria-hidden />
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={avatarUploading}
                      onChange={(e) => {
                        void handleAvatarFile(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="min-w-0 space-y-1 pb-1 sm:pb-2">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{user?.displayName ?? "—"}</h1>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{user?.email ?? "—"}</span>
                  </p>
                  {user?.role ? (
                    <Badge variant="secondary" className="mt-1">
                      {formatUserRole(user.role, t)}
                    </Badge>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {t("profile.avatarHint", "Tap the camera icon to upload or change your profile picture.")}
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="shrink-0 self-start sm:self-auto"
                onClick={() => setPasswordOpen(true)}
              >
                <KeyRound className="size-4" aria-hidden />
                {t("profile.changePasswordButton", "Change password")}
              </Button>
            </div>

            <p className="mt-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t("profile.aboutPlaceholder")}
            </p>

            <dl className="mt-6 grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-muted/30 text-center">
              <div className="px-2 py-3">
                <dt className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Shield className="size-3.5" aria-hidden />
                  {t("profile.statRole", "Role")}
                </dt>
                <dd className="mt-1 truncate text-sm font-semibold">
                  {user?.role ? formatUserRole(user.role, t) : "—"}
                </dd>
              </div>
              <div className="px-2 py-3">
                <dt className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Mail className="size-3.5" aria-hidden />
                  {t("profile.statAccount", "Account")}
                </dt>
                <dd className="mt-1 truncate text-sm font-semibold">
                  {user?.tenantId ? t("profile.statOrgMember", "Organization") : t("profile.statPlatform", "Platform")}
                </dd>
              </div>
              <div className="px-2 py-3">
                <dt className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <LayoutGrid className="size-3.5" aria-hidden />
                  {t("profile.statModules", "Modules")}
                </dt>
                <dd className="mt-1 text-sm font-semibold">{modulesLabel}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5 sm:p-6">
            <h2 className="text-base font-semibold">{t("profile.about", "About")}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{t("profile.aboutPlaceholder")}</p>
            <div className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("profile.roleLabel", "Role")}
                </p>
                <p className="mt-1 font-medium">{user?.role ? formatUserRole(user.role, t) : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("auth.email", "Email")}
                </p>
                <p className="mt-1 break-all font-medium">{user?.email ?? "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {cropImageUrl ? (
        <ImageCropDialog
          open={cropOpen}
          onOpenChange={(open) => {
            if (!open && !avatarUploading) clearCropState();
            else setCropOpen(open);
          }}
          imageUrl={cropImageUrl}
          fileName={cropFileName}
          contentType={cropContentType}
          pending={avatarUploading}
          onApply={applyAvatarCrop}
        />
      ) : null}

      <Dialog
        open={passwordOpen}
        onOpenChange={(open) => {
          if (!open) closePasswordDialog();
          else setPasswordOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("profile.changePasswordTitle", "Change password")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("profile.changePasswordHint", "Update the password you use to sign in to this account.")}
          </p>
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
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit" disabled={submitting || !currentPassword || !newPassword || !confirmPassword}>
                {submitting ? t("common.loading") : t("profile.updatePassword", "Update password")}
              </Button>
              <Button type="button" variant="outline" onClick={closePasswordDialog}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
