import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/stores/auth-store";
import { formatUserRole } from "@/lib/locale-display";

export function ProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const initials = user?.displayName
    ? user.displayName
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

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
    </div>
  );
}
