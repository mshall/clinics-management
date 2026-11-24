import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Mail, MessageCircle, RotateCw, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/http";
import {
  INVITABLE_ROLES,
  createInvitation,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  type InvitationDto,
} from "@/lib/invitations-api";

export function StaffInvitationsPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [contact, setContact] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roles, setRoles] = useState<string[]>(["RECEPTIONIST"]);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["invitations"], queryFn: listInvitations });
  const refresh = (inv: InvitationDto) => {
    if (inv.acceptUrl) setLastLink(inv.acceptUrl);
    void qc.invalidateQueries({ queryKey: ["invitations"] });
  };
  const onError = (e: unknown) => {
    if (e instanceof ApiError && e.status === 402) return;
    toast.error(e instanceof Error ? e.message : t("invitations.failed"));
  };
  const create = useMutation({
    mutationFn: () => createInvitation({ phoneOrEmail: contact.trim(), roles, displayName: displayName.trim() || undefined }),
    onSuccess: (inv) => {
      toast.success(t(inv.channel === "EMAIL" ? "invitations.sentEmail" : "invitations.sentWhatsApp"));
      setContact("");
      setDisplayName("");
      refresh(inv);
    },
    onError,
  });
  const resend = useMutation({ mutationFn: resendInvitation, onSuccess: refresh, onError });
  const revoke = useMutation({ mutationFn: revokeInvitation, onSuccess: refresh, onError });

  const toggleRole = (r: string) =>
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const pending = (list.data ?? []).filter((i) => i.status === "PENDING");
  const recent = (list.data ?? []).filter((i) => i.status !== "PENDING").slice(0, 10);

  return (
    <Card data-testid="staff-invitations">
      <CardHeader>
        <CardTitle className="text-lg">{t("invitations.title")}</CardTitle>
        <CardDescription>{t("invitations.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (contact.trim() && roles.length) create.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="invite-contact">{t("invitations.contact")}</Label>
              <Input
                id="invite-contact"
                data-setup-target="invite_receptionist"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={t("invitations.contactPlaceholder")}
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-name">{t("invitations.name")}</Label>
              <Input id="invite-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{t("invitations.roles")}</legend>
            <div className="flex flex-wrap gap-2">
              {INVITABLE_ROLES.map((r) => (
                <label key={r} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                  <input type="checkbox" checked={roles.includes(r)} onChange={() => toggleRole(r)} />
                  {t(`invitations.role.${r}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={!contact.trim() || !roles.length || create.isPending}>
            {t("invitations.send")}
          </Button>
        </form>

        {lastLink ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-xs">
            <span className="min-w-0 flex-1 truncate" dir="ltr" data-testid="invite-link">
              {lastLink}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void navigator.clipboard?.writeText(lastLink).then(() => toast.success(t("invitations.copied")))}
            >
              <Copy className="me-1 size-3" aria-hidden />
              {t("invitations.copyLink")}
            </Button>
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{t("invitations.pending", { count: pending.length })}</h3>
          {pending.length === 0 ? <p className="text-sm text-muted-foreground">{t("invitations.none")}</p> : null}
          <ul className="space-y-2">
            {pending.map((inv) => (
              <InvitationRow
                key={inv.id}
                inv={inv}
                busy={resend.isPending || revoke.isPending}
                onResend={() => resend.mutate(inv.id)}
                onRevoke={() => revoke.mutate(inv.id)}
              />
            ))}
          </ul>
          {recent.length ? (
            <ul className="space-y-1 pt-2 text-xs text-muted-foreground">
              {recent.map((inv) => (
                <li key={inv.id} dir="auto">
                  {inv.phoneOrEmail} · {t(`invitations.status.${inv.status}`)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function InvitationRow({
  inv,
  busy,
  onResend,
  onRevoke,
}: {
  inv: InvitationDto;
  busy: boolean;
  onResend: () => void;
  onRevoke: () => void;
}) {
  const { t, i18n } = useTranslation();
  const Icon = inv.channel === "EMAIL" ? Mail : MessageCircle;
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" dir="ltr">
          {inv.displayName ? `${inv.displayName} · ` : ""}
          {inv.phoneOrEmail}
        </p>
        <p className="text-xs text-muted-foreground">
          {inv.roles.map((r) => t(`invitations.role.${r}`, { defaultValue: r })).join("، ")} ·{" "}
          {t("invitations.expires", { date: new Date(inv.expiresAt).toLocaleDateString(i18n.language) })}
        </p>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onResend}>
        <RotateCw className="me-1 size-3" aria-hidden />
        {t("invitations.resend")}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRevoke}>
        <X className="me-1 size-3" aria-hidden />
        {t("invitations.revoke")}
      </Button>
    </li>
  );
}
