const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif"]);

function extensionOf(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function inferMimeFromFileName(fileName: string): string {
  switch (extensionOf(fileName)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "pdf":
      return "application/pdf";
    default:
      return "";
  }
}

export function normalizeMimeType(contentType: string | undefined | null): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export function resolveViewerContentType(
  contentType: string | undefined | null,
  fileName: string,
  storedMime?: string,
): string {
  const fromHeader = normalizeMimeType(contentType);
  if (fromHeader.startsWith("image/") || fromHeader.includes("pdf")) {
    return fromHeader;
  }

  const fromStored = normalizeMimeType(storedMime);
  if (fromStored.startsWith("image/") || fromStored.includes("pdf")) {
    return fromStored;
  }

  const fromName = inferMimeFromFileName(fileName);
  if (fromName) return fromName;

  return fromHeader || fromStored || "application/octet-stream";
}

export function isImageViewerContent(contentType: string, fileName: string): boolean {
  const resolved = resolveViewerContentType(contentType, fileName);
  if (resolved.startsWith("image/")) return true;
  return IMAGE_EXTENSIONS.has(extensionOf(fileName));
}

export function isPdfViewerContent(contentType: string, fileName: string): boolean {
  const resolved = resolveViewerContentType(contentType, fileName);
  if (resolved.includes("pdf")) return true;
  return extensionOf(fileName) === "pdf";
}
