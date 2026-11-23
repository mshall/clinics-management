import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiDelete, apiGet, apiPost } from "@/lib/http";
import { useAuthStore } from "@/stores/auth-store";

type SessionRow = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  current: boolean;
};

export function ProfileSessionsPanel() {
  const { t } = useTranslation();
  const signOut = useAuthStore((s) => s.signOut);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<SessionRow[]>("/api/v1/auth/sessions");
      setRows(data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Initial load (`loading` starts true, so no synchronous state update is needed here).
  useEffect(() => {
    let active = true;
    apiGet<SessionRow[]>("/api/v1/auth/sessions")
      .then((data) => {
        if (active) setRows(data);
      })
      .catch((err: unknown) => {
        if (active) toast.error(err instanceof ApiError ? err.message : t("common.error"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  async function revoke(id: string) {
    try {
      await apiDelete(`/api/v1/auth/sessions/${id}`);
      await load();
      toast.success(t("profile.sessions.revoked"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    }
  }

  async function revokeAll() {
    try {
      await apiPost("/api/v1/auth/sessions/revoke-all", {});
      signOut();
      toast.success(t("profile.sessions.revokedAll"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.error"));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{t("profile.sessions.title")}</CardTitle>
        <Button variant="outline" size="sm" onClick={() => void revokeAll()}>
          {t("profile.sessions.signOutAll")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : null}
        {!loading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("profile.sessions.empty")}</p>
        ) : null}
        {rows.map((row) => (
          <div key={row.id} className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm">
            <div>
              {row.current ? <span className="font-medium">{t("profile.sessions.thisDevice")}</span> : null}
              <p className="text-muted-foreground">{row.userAgent ?? t("profile.sessions.unknownDevice")}</p>
              <p className="text-xs text-muted-foreground">
                {t("profile.sessions.lastActive", { when: new Date(row.lastSeenAt).toLocaleString() })}
              </p>
            </div>
            {!row.current ? (
              <Button variant="ghost" size="sm" onClick={() => void revoke(row.id)}>
                {t("profile.sessions.revoke")}
              </Button>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}