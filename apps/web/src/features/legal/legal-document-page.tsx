import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchLegalDocument, type LegalCatalogItem } from "@/lib/legal-api";

export function LegalDocumentPage() {
  const { docId = "" } = useParams();
  const { t, i18n } = useTranslation();
  const [doc, setDoc] = useState<LegalCatalogItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) return;
    void fetchLegalDocument(docId)
      .then(setDoc)
      .catch(() => setError(t("legal.errors.load")));
  }, [docId, t]);

  const title = doc ? (i18n.language.startsWith("ar") ? doc.titleAr : doc.titleEn) : "";
  const body = doc ? (i18n.language.startsWith("ar") ? doc.bodyAr : doc.bodyEn) : "";

  return (
    <div className="min-h-dvh bg-muted/40 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link to="/login" className="text-sm text-muted-foreground underline">
          {t("signup.backToLogin")}
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>{title || t("legal.documentTitle")}</CardTitle>
            {doc ? (
              <p className="text-xs text-muted-foreground">
                {t("legal.version", { version: doc.version })}
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {body ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p> : null}
            {!error && !body ? <p className="text-sm text-muted-foreground">{t("common.loading")}</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}