import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ZoomableImage } from "@/components/zoomable-image";

type DocumentViewerOverlayProps = {
  fileName: string;
  url: string;
  contentType: string;
  onClose: () => void;
  headerActions?: ReactNode;
};

export function DocumentViewerOverlay({
  fileName,
  url,
  contentType,
  onClose,
  headerActions,
}: DocumentViewerOverlayProps) {
  const { t } = useTranslation();

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <p className="min-w-0 truncate text-sm font-medium">{fileName}</p>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </div>
        <div className="max-h-[calc(90vh-3rem)] overflow-auto p-4">
          {contentType.startsWith("image/") ? (
            <ZoomableImage src={url} alt={fileName} />
          ) : contentType.includes("pdf") ? (
            <iframe title={fileName} src={url} className="h-[70vh] w-full rounded border" />
          ) : (
            <a href={url} download={fileName} className="text-primary underline">
              {t("encounters.downloadFile", "Download file")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
