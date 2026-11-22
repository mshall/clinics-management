import { Download, Eye } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DocumentViewerOverlay } from "@/components/document-viewer-overlay";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { OperationDocumentDto } from "@/lib/api-types";
import { apiFetchBlob } from "@/lib/http";
import { resolveViewerContentType } from "@/lib/image-mime";

type Props = {
  operationId: string;
  doc: OperationDocumentDto;
  className?: string;
};

type ViewerState = {
  url: string;
  contentType: string;
  fileName: string;
};

export function OperationDocumentFileActions({ operationId, doc, className }: Props) {
  const { t } = useTranslation();
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [busy, setBusy] = useState<"view" | "download" | null>(null);
  const urlRef = useRef<string | null>(null);

  const revokeViewerUrl = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  useEffect(() => () => revokeViewerUrl(), []);

  const closeViewer = () => {
    revokeViewerUrl();
    setViewer(null);
  };

  const fetchBlob = async () => {
    const path = `/api/v1/operations/${operationId}/documents/${doc.id}/file`;
    return apiFetchBlob(path);
  };

  const onView = async () => {
    setBusy("view");
    try {
      const { blob, contentType } = await fetchBlob();
      revokeViewerUrl();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const fileName = doc.originalFileName || "document";
      setViewer({
        url,
        contentType: resolveViewerContentType(contentType, fileName, doc.mimeType),
        fileName,
      });
    } catch (e: unknown) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const onDownload = async () => {
    setBusy("download");
    try {
      const { blob } = await fetchBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.originalFileName || "document";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: unknown) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className={className ?? "flex shrink-0 flex-wrap gap-1"}>
        <Button type="button" size="sm" variant="outline" disabled={busy != null} onClick={() => void onView()}>
          <Eye className="h-4 w-4" />
          <span className="ms-1">{t("encounters.viewDoc", "View")}</span>
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy != null} onClick={() => void onDownload()}>
          <Download className="h-4 w-4" />
          <span className="ms-1">{t("patients.downloadDocument", "Download")}</span>
        </Button>
      </div>
      {viewer ? (
        <DocumentViewerOverlay
          fileName={viewer.fileName}
          url={viewer.url}
          contentType={viewer.contentType}
          onClose={closeViewer}
          loading={busy === "view"}
          headerActions={
            <Button type="button" size="sm" variant="outline" onClick={() => void onDownload()}>
              <Download className="h-4 w-4" />
              <span className="ms-1">{t("patients.downloadDocument", "Download")}</span>
            </Button>
          }
        />
      ) : null}
    </>
  );
}
