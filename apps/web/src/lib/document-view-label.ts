import { isImageViewerContent, isPdfViewerContent } from "@/lib/image-mime";

/** Localized View / View picture / View PDF label for document actions. */
export function documentViewActionLabel(
  fileName: string,
  mimeType: string | null | undefined,
  t: (key: string, fallback: string) => string,
): string {
  if (isPdfViewerContent(mimeType ?? "", fileName)) {
    return t("common.viewPdf", "View PDF");
  }
  if (isImageViewerContent(mimeType ?? "", fileName)) {
    return t("common.viewPicture", "View picture");
  }
  return t("encounters.viewDoc", "View");
}
