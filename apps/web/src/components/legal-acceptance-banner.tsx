import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { fetchLegalStatus, postLegalAccept, type LegalStatus } from "@/lib/legal-api";
import { useAuthStore } from "@/stores/auth-store";

export function LegalAcceptanceBanner() {
  const { t, i18n } = useTranslation();
  const token = useAuthStore((s) => s.accessToken);
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus(null);
      return;
    }
    void fetchLegalStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [token]);

  if (!status || status.satisfied) return null;

  async function acceptAll() {
    setBusy(true);
    try {
      const acceptances = status!.pending.map((p) => ({ document: p.document, version: p.version }));
      const next = await postLegalAccept(acceptances);
      setStatus(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 bg-accent px-4 py-2.5 text-sm text-accent-foreground"
    >
      <span>{t("legal.banner.prompt")}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {status.pending.map((p) => (
          <Link
            key={p.document}
            to={`/legal/${p.document}`}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            {i18n.language.startsWith("ar") ? p.titleAr : p.titleEn}
          </Link>
        ))}
        <Button type="button" size="sm" disabled={busy} onClick={() => void acceptAll()}>
          {t("legal.banner.accept")}
        </Button>
      </div>
    </div>
  );
}