import { absoluteDownloadUrl } from "@/lib/api-url";

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
};

type FileSystemWritable = {
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};

type FileSystemFileHandle = {
  createWritable: () => Promise<FileSystemWritable>;
};

declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
}

export type OrgBackupDownloadProgress = {
  /** 0–100 while bytes are transferring after the job is READY. */
  percent: number;
  receivedBytes: number;
  totalBytes: number | null;
};

/**
 * Download a READY org-backup artifact reliably.
 * Prefer File System Access streaming (no Chrome download-manager mid-stream failures).
 * Falls back to a same-tab blob object URL, then to a native navigation download.
 */
export async function downloadOrgBackupFile(
  downloadUrl: string,
  fileName: string,
  opts?: {
    signal?: AbortSignal;
    onProgress?: (p: OrgBackupDownloadProgress) => void;
  },
): Promise<"streamed" | "blob" | "native"> {
  const url = absoluteDownloadUrl(downloadUrl);
  const signal = opts?.signal;

  // 1) Stream to a user-picked file (best for large ZIPs).
  if (typeof window !== "undefined" && typeof window.showSaveFilePicker === "function") {
    let writable: FileSystemWritable | null = null;
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName || "kiorly-org-backup.zip",
        types: [
          {
            description: "Backup",
            accept: {
              "application/zip": [".zip"],
              "application/sql": [".sql"],
              "application/octet-stream": [".zip", ".sql", ".bin"],
            },
          },
        ],
      });
      writable = await handle.createWritable();
      const res = await fetch(url, { method: "GET", credentials: "omit", signal, cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Download failed (${res.status})`);
      }
      if (!res.body) {
        throw new Error("Download stream unavailable");
      }
      const totalHeader = res.headers.get("Content-Length");
      const totalBytes = totalHeader ? Number(totalHeader) : null;
      let receivedBytes = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        await writable.write(value);
        receivedBytes += value.byteLength;
        opts?.onProgress?.({
          percent: totalBytes && totalBytes > 0 ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : 0,
          receivedBytes,
          totalBytes: Number.isFinite(totalBytes) ? totalBytes : null,
        });
      }
      await writable.close();
      writable = null;
      opts?.onProgress?.({
        percent: 100,
        receivedBytes,
        totalBytes: Number.isFinite(totalBytes) ? totalBytes : receivedBytes,
      });
      return "streamed";
    } catch (e) {
      if (writable?.abort) await writable.abort().catch(() => undefined);
      // User cancelled the save picker — not a download failure.
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      if (signal?.aborted) throw e;
      // Fall through to blob / native if File System Access fails (permissions, insecure context, etc.).
    }
  }

  // 2) Fetch whole body → object URL (works for moderate sizes; still avoids Vite proxy if absolute).
  try {
    const res = await fetch(url, { method: "GET", credentials: "omit", signal, cache: "no-store" });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const totalHeader = res.headers.get("Content-Length");
    const totalBytes = totalHeader ? Number(totalHeader) : null;
    if (res.body && totalBytes && totalBytes > 32 * 1024 * 1024) {
      // Large body: avoid buffering everything when we couldn't stream to disk.
      throw new Error("too_large_for_blob");
    }
    const blob = await res.blob();
    opts?.onProgress?.({ percent: 100, receivedBytes: blob.size, totalBytes: blob.size });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName || "kiorly-org-backup.bin";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return "blob";
  } catch (e) {
    if (signal?.aborted) throw e;
    if (e instanceof Error && e.message === "too_large_for_blob") {
      // continue to native
    } else if (!(e instanceof Error && e.message.startsWith("Download failed"))) {
      // network/CORS — try native as last resort
    } else {
      throw e;
    }
  }

  // 3) Last resort: browser navigation download (may still fail via proxies on huge files).
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return "native";
}
