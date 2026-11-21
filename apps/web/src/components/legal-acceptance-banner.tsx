import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { fetchLegalStatus, postLegalAccept, type LegalStatus } from "@/lib/legal-api";
import { useAuthStore } from "@/stores/auth-store";

export function LegalAcceptanceBanner() {
  const { t, i18n } = useTranslation();
  const token = useAuthStore((s) => s.accessToken);
  const [fetched, setFetched] = useState<{ token: string; value: LegalStatus | null } | null>(null);
  const status = token && fetched?.token === token ? fetched.value : null;
  const setStatus = (value: LegalStatus | null) => {
    if (token) setFetched({ token, value });
  };
  const [busy, setBusy] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    void fetchLegalStatus()
      .then((value) => setFetched({ token, value }))
      .catch(() => setFetched({ token, value: null }));
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
    <div role="status" className="border-b border-primary/15 bg-accent/70 px-3 py-1.5 text-sm text-accent-foreground sm:px-4 md:ps-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 truncate font-medium max-sm:basis-full" title={t("legal.banner.prompt")}>{t("legal.banner.prompt")}</span>
        <button type="button" className="text-xs font-medium underline underline-offset-4" aria-expanded={docsOpen} onClick={() => setDocsOpen((v) => !v)}>
          {t("legal.banner.documents", "Documents")} ({status.pending.length})
        </button>
        <Button type="button" size="sm" className="kx-hdr ms-auto h-8 min-h-8 sm:ms-0 sm:h-7 sm:min-h-7" disabled={busy} onClick={() => void acceptAll()}>
          {t("legal.banner.accept")}
        </Button>
      </div>
      {docsOpen ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-primary/10 pt-1.5">
          {status.pending.map((p) => (
            <Link key={p.document} to={`/legal/${p.document}`} className="text-xs text-accent-foreground underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
              {i18n.language.startsWith("ar") ? p.titleAr : p.titleEn}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
