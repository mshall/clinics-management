import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirrors absoluteDownloadUrl local-Vite rewrite without importing Vite env.
 * Keeps the mid-stream proxy bypass regression-covered in CI unit tests.
 */
function absoluteDownloadUrlForTest(
  path: string,
  opts: { apiBase: string; hostname: string; port: string; protocol: string },
): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const resolved = opts.apiBase ? `${opts.apiBase.replace(/\/$/, "")}${p}` : p;
  if (/^https?:\/\//i.test(resolved)) return resolved;
  const isLocalVite =
    (opts.hostname === "127.0.0.1" || opts.hostname === "localhost") && /^517\d$/.test(opts.port || "");
  if (isLocalVite) {
    const host = opts.hostname === "localhost" ? "localhost" : "127.0.0.1";
    return `${opts.protocol}//${host}:3000${resolved}`;
  }
  return resolved;
}

describe("absoluteDownloadUrl (org backup)", () => {
  it("rewrites same-origin paths to API :3000 when UI is on Vite 5173", () => {
    const url = absoluteDownloadUrlForTest("/api/v1/admin/org-backup/download?token=abc", {
      apiBase: "",
      hostname: "127.0.0.1",
      port: "5173",
      protocol: "http:",
    });
    assert.equal(url, "http://127.0.0.1:3000/api/v1/admin/org-backup/download?token=abc");
  });

  it("leaves absolute VITE_API_URL downloads unchanged", () => {
    const url = absoluteDownloadUrlForTest("/api/v1/admin/org-backup/download?token=abc", {
      apiBase: "https://api.example.com",
      hostname: "127.0.0.1",
      port: "5173",
      protocol: "http:",
    });
    assert.equal(url, "https://api.example.com/api/v1/admin/org-backup/download?token=abc");
  });
});
