import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicInvitationError, acceptInvitation, fetchPublicInvitation } from "@/lib/invitations-api";

export function AcceptInvitationPage() {
  const { token = "" } = useParams();
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  const view = useQuery({ queryKey: ["public-invitation", token], queryFn: () => fetchPublicInvitation(token), retry: false });
  const accept = useMutation({
    mutationFn: () =>
      acceptInvitation(token, {
        password,
        email: view.data?.email ? undefined : email.trim(),
        displayName: displayName.trim() || undefined,
      }),
  });

  const isAr = i18n.language.startsWith("ar");
  const errCode = view.error instanceof PublicInvitationError ? view.error.code : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("invitations.acceptTitle")}</CardTitle>
          {view.data ? (
            <CardDescription>
              {t("invitations.acceptSubtitle", {
                clinic: isAr ? view.data.clinicNameAr : view.data.clinicName,
                roles: view.data.roles.map((r) => t(`invitations.role.${r}`, { defaultValue: r })).join(isAr ? "، " : ", "),
              })}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {view.isError ? (
            <p className="text-sm text-destructive" data-testid="invite-error">
              {t(`invitations.publicError.${errCode ?? "INVITE_NOT_FOUND"}`, { defaultValue: t("invitations.publicError.INVITE_NOT_FOUND") })}
            </p>
          ) : null}
          {accept.isSuccess ? (
            <div className="space-y-3" data-testid="invite-accepted">
              <p className="text-sm">{t("invitations.acceptedBody", { email: accept.data.email })}</p>
              <Button asChild className="w-full">
                <Link to="/login">{t("invitations.goToLogin")}</Link>
              </Button>
            </div>
          ) : view.data ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                accept.mutate();
              }}
            >
              {view.data.email ? (
                <p className="text-sm" dir="ltr">
                  {view.data.email}
                </p>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor="accept-email">{t("invitations.email")}</Label>
                  <Input id="accept-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="accept-name">{t("invitations.name")}</Label>
                <Input id="accept-name" value={displayName} placeholder={view.data.displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="accept-password">{t("invitations.password")}</Label>
                <Input
                  id="accept-password"
                  type="password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("invitations.passwordHint")}</p>
              </div>
              {accept.isError ? (
                <p className="text-sm text-destructive">{accept.error instanceof Error ? accept.error.message : ""}</p>
              ) : null}
              <Button type="submit" className="w-full" disabled={accept.isPending}>
                {t("invitations.acceptCta")}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
