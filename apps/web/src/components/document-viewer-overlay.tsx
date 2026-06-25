import type { ReactNode } from "react";
import { Crop } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ZoomableImage } from "@/components/zoomable-image";
import { isImageViewerContent, isPdfViewerContent, resolveViewerContentType } from "@/lib/image-mime";

export type DocumentGalleryNavigation = {
  index: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  canPrevious: boolean;
  canNext: boolean;
};

type DocumentViewerOverlayProps = {
  fileName: string;
  url: string;
  contentType: string;
  onClose: () => void;
  headerActions?: ReactNode;
  loading?: boolean;
  gallery?: DocumentGalleryNavigation;
  canCrop?: boolean;
  onCrop?: () => void;
  cropPending?: boolean;
};

export function DocumentViewerOverlay({
  fileName,
  url,
  contentType,
  onClose,
  headerActions,
  loading = false,
  gallery,
  canCrop = false,
  onCrop,
  cropPending = false,
}: DocumentViewerOverlayProps) {
  const { t } = useTranslation();
  const resolvedType = resolveViewerContentType(contentType, fileName);
  const showImage = isImageViewerContent(resolvedType, fileName);
  const showPdf = isPdfViewerContent(resolvedType, fileName);

  const slideLabel =
    gallery && gallery.total > 1
      ? t("common.slideNOfM", "{{current}} / {{total}}", {
          current: gallery.index + 1,
          total: gallery.total,
        })
      : undefined;

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
            {canCrop && onCrop ? (
              <Button type="button" variant="outline" size="sm" disabled={loading || cropPending} onClick={onCrop}>
                <Crop className="h-4 w-4" />
                <span className="ms-1">{t("patients.cropDocument", "Crop")}</span>
              </Button>
            ) : null}
            {headerActions}
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </div>
        <div className="max-h-[calc(90vh-3rem)] overflow-auto p-4">
          {showImage ? (
            <ZoomableImage
              key={url || fileName}
              src={url}
              alt={fileName}
              loading={loading || !url}
              slideLabel={slideLabel}
              onPrevious={gallery?.canPrevious ? gallery.onPrevious : undefined}
              onNext={gallery?.canNext ? gallery.onNext : undefined}
              canPrevious={gallery?.canPrevious}
              canNext={gallery?.canNext}
            />
          ) : showPdf ? (
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
