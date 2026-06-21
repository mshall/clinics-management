import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type DocumentViewerOverlayProps = {
  fileName: string;
  url: string;
  contentType: string;
  onClose: () => void;
};

export function DocumentViewerOverlay({ fileName, url, contentType, onClose }: DocumentViewerOverlayProps) {
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
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <p className="truncate text-sm font-medium">{fileName}</p>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
        <div className="max-h-[calc(90vh-3rem)] overflow-auto p-4">
          {contentType.startsWith("image/") ? (
            <img src={url} alt="" className="mx-auto max-h-[70vh] max-w-full object-contain" />
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
