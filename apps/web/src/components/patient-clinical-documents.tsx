import { Download, Eye, FileText, FlaskConical, Pill, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { DocumentViewerOverlay } from "@/components/document-viewer-overlay";
import { PatientClinicalSectionUpload } from "@/components/patient-clinical-section-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePatientClinicalDocumentsQuery } from "@/lib/api-hooks";
import type { PatientClinicalDocumentItem } from "@/lib/patient-document-category";
import { apiFetchBlob } from "@/lib/http";
import { isImageViewerContent, resolveViewerContentType } from "@/lib/image-mime";
import { apiErrorMessage } from "@/features/platform/platform-shared";
import { localeForLanguage } from "@/lib/locale-display";

type PatientClinicalDocumentsProps = {
  patientId: string;
};

type ViewerState = {
  items: PatientClinicalDocumentItem[];
  index: number;
  urls: Record<string, string>;
  contentTypes: Record<string, string>;
  loading: boolean;
};

function clinicalDocKey(doc: PatientClinicalDocumentItem): string {
  return `${doc.source}:${doc.id}`;
}

export function PatientClinicalDocuments({ patientId }: PatientClinicalDocumentsProps) {
  const { t, i18n } = useTranslation();
  const { data, isPending } = usePatientClinicalDocumentsQuery(patientId);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const viewerUrlsRef = useRef<Record<string, string>>({});

  const revokeAllViewerUrls = () => {
    for (const url of Object.values(viewerUrlsRef.current)) {
      URL.revokeObjectURL(url);
    }
    viewerUrlsRef.current = {};
  };

  useEffect(() => {
    return () => {
      revokeAllViewerUrls();
    };
  }, []);

  const closeViewer = () => {
    revokeAllViewerUrls();
    setViewer(null);
  };

  const documentPath = (doc: PatientClinicalDocumentItem) =>
    doc.source === "encounter" && doc.encounterId
      ? `/api/v1/encounters/${doc.encounterId}/documents/${doc.id}/file`
      : `/api/v1/patients/${patientId}/documents/${doc.id}`;

  const loadSlide = async (items: PatientClinicalDocumentItem[], index: number, existing?: ViewerState) => {
    const doc = items[index];
    if (!doc) return;
    const key = clinicalDocKey(doc);
    if (existing?.urls[key]) {
      setViewer({ ...existing, items, index, loading: false });
      return;
    }

    setViewer({
      items,
      index,
      urls: existing?.urls ?? {},
      contentTypes: existing?.contentTypes ?? {},
      loading: true,
    });

    try {
      const { blob, contentType } = await apiFetchBlob(documentPath(doc));
      const url = URL.createObjectURL(blob);
      viewerUrlsRef.current[key] = url;
      const resolved = resolveViewerContentType(contentType, doc.originalFileName, doc.mimeType);
      setViewer((prev) => ({
        items,
        index,
        loading: false,
        urls: { ...(prev?.urls ?? {}), [key]: url },
        contentTypes: { ...(prev?.contentTypes ?? {}), [key]: resolved },
      }));
    } catch (e: unknown) {
      setViewer((prev) => (prev ? { ...prev, loading: false } : prev));
      toast.error(apiErrorMessage(e));
    }
  };

  const openDocument = async (doc: PatientClinicalDocumentItem, sectionItems: PatientClinicalDocumentItem[]) => {
    const imageItems = sectionItems.filter((item) => isImageViewerContent(item.mimeType, item.originalFileName));
    const isImage = isImageViewerContent(doc.mimeType, doc.originalFileName);
    const galleryItems = isImage && imageItems.length > 0 ? imageItems : [doc];
    const index = galleryItems.findIndex((item) => item.source === doc.source && item.id === doc.id);
    revokeAllViewerUrls();
    await loadSlide(galleryItems, index >= 0 ? index : 0);
  };

  const goToSlide = (nextIndex: number) => {
    if (!viewer) return;
    if (nextIndex < 0 || nextIndex >= viewer.items.length) return;
    void loadSlide(viewer.items, nextIndex, viewer);
  };

  const downloadDocument = async (doc: PatientClinicalDocumentItem) => {
    try {
      const { blob } = await apiFetchBlob(documentPath(doc));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = doc.originalFileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: unknown) {
      toast.error(apiErrorMessage(e));
    }
  };

  if (isPending) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  const locale = localeForLanguage(i18n.language);

  const clinicalSections = [
    {
      key: "labs" as const,
      category: "LAB_RESULTS" as const,
      icon: FlaskConical,
      iconClass: "text-emerald-600",
      title: t("patients.clinicalLabs", "Lab results"),
      hint: t("patients.clinicalLabsHint", "Lab reports from registration and encounters."),
      items: data?.labs ?? [],
      showDownload: false,
    },
    {
      key: "radiology" as const,
      category: "RADIOLOGY" as const,
      icon: ScanLine,
      iconClass: "text-sky-600",
      title: t("patients.clinicalRadiology", "Radiology"),
      hint: t("patients.clinicalRadiologyHint", "Imaging reports from registration and encounters."),
      items: data?.radiology ?? [],
      showDownload: false,
    },
    {
      key: "prescriptions" as const,
      category: "PRESCRIPTION" as const,
      icon: Pill,
      iconClass: "text-violet-600",
      title: t("patients.clinicalPrescriptions", "Prescriptions"),
      hint: t("patients.clinicalPrescriptionsHint", "Prescriptions from registration and encounters."),
      items: data?.prescriptions ?? [],
      showDownload: false,
    },
  ];

  const otherItems = data?.other ?? [];

  return (
    <>
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          {clinicalSections.map(({ key, category, icon: Icon, iconClass, title, hint, items, showDownload }) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} aria-hidden />
                  {title}
                </CardTitle>
                <CardDescription>{hint}</CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentList
                  items={items}
                  locale={locale}
                  showDownload={showDownload}
                  emphasizeDescription={false}
                  onView={(doc) => void openDocument(doc, items)}
                  onDownload={(doc) => void downloadDocument(doc)}
                />
                <PatientClinicalSectionUpload patientId={patientId} category={category} />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              {t("patients.clinicalOther", "Other documents")}
            </CardTitle>
            <CardDescription>
              {t("patients.clinicalOtherHint", "Miscellaneous documents attached at registration or from the profile.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentList
              items={otherItems}
              locale={locale}
              showDownload
              emphasizeDescription
              onView={(doc) => void openDocument(doc, otherItems)}
              onDownload={(doc) => void downloadDocument(doc)}
            />
            <PatientClinicalSectionUpload patientId={patientId} category="OTHER" />
          </CardContent>
        </Card>
      </div>
      {viewer ? (() => {
        const current = viewer.items[viewer.index];
        if (!current) return null;
        const key = clinicalDocKey(current);
        const isGallery =
          viewer.items.length > 1 &&
          viewer.items.every((item) => isImageViewerContent(item.mimeType, item.originalFileName));
        return (
          <DocumentViewerOverlay
            fileName={current.originalFileName}
            url={viewer.urls[key] ?? ""}
            contentType={viewer.contentTypes[key] ?? current.mimeType}
            loading={viewer.loading}
            onClose={closeViewer}
            gallery={
              isGallery
                ? {
                    index: viewer.index,
                    total: viewer.items.length,
                    onPrevious: () => goToSlide(viewer.index - 1),
                    onNext: () => goToSlide(viewer.index + 1),
                    canPrevious: viewer.index > 0,
                    canNext: viewer.index < viewer.items.length - 1,
                  }
                : undefined
            }
          />
        );
      })() : null}
    </>
  );
}

function DocumentList({
  items,
  locale,
  showDownload,
  emphasizeDescription,
  onView,
  onDownload,
}: {
  items: PatientClinicalDocumentItem[];
  locale: string;
  showDownload: boolean;
  emphasizeDescription: boolean;
  onView: (doc: PatientClinicalDocumentItem) => void;
  onDownload: (doc: PatientClinicalDocumentItem) => void;
}) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("patients.noClinicalDocs", "No documents yet.")}</p>;
  }

  return (
    <ul className="space-y-2 text-sm">
      {items.map((doc) => (
        <li
          key={`${doc.source}-${doc.id}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            {emphasizeDescription && doc.description ? (
              <p className="font-medium">{doc.description}</p>
            ) : null}
            <p className={emphasizeDescription && doc.description ? "truncate text-xs text-muted-foreground ltr-nums" : "truncate font-medium"}>
              {doc.originalFileName}
            </p>
            <p className="text-xs text-muted-foreground ltr-nums">
              {new Date(doc.createdAt).toLocaleDateString(locale)}
            </p>
            {!emphasizeDescription && doc.source === "encounter" && doc.encounterId ? (
              <Link
                to={`/encounters/${doc.encounterId}`}
                className="text-xs text-primary underline-offset-2 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {t("patients.fromEncounter", "Encounter · {{visitType}}", {
                  visitType: doc.encounterVisitType ?? t("encounters.title", "Encounter"),
                })}
              </Link>
            ) : !emphasizeDescription && doc.description ? (
              <p className="truncate text-xs text-muted-foreground">{doc.description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onView(doc)}>
              <Eye className="h-4 w-4" />
              <span className="ms-1">{t("encounters.viewDoc", "View")}</span>
            </Button>
            {showDownload ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onDownload(doc)}>
                <Download className="h-4 w-4" />
                <span className="ms-1">{t("patients.downloadDocument", "Download")}</span>
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
