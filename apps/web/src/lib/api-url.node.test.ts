import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Mirrors absoluteDownloadUrl local-Vite rewrite without importing Vite env.
 * Keeps the mid-stream proxy bypass regression-covered in CI unit tests.
 */
const LOCAL_WEB_TO_API_PORT: Record<string, string> = {
  "5173": "3000",
  "5174": "3010",
  "5190": "3020",
};

function absoluteDownloadUrlForTest(
  path: string,
  opts: { apiBase: string; hostname: string; port: string; protocol: string; viteApiPort?: string },
): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const resolved = opts.apiBase ? `${opts.apiBase.replace(/\/$/, "")}${p}` : p;
  if (/^https?:\/\//i.test(resolved)) return resolved;
  const isLocalVite =
    (opts.hostname === "127.0.0.1" || opts.hostname === "localhost") &&
    /^(517\d|518\d|519\d)$/.test(opts.port || "");
  if (isLocalVite) {
    const host = opts.hostname === "localhost" ? "localhost" : "127.0.0.1";
    const apiPort = opts.viteApiPort || LOCAL_WEB_TO_API_PORT[opts.port] || "3010";
    return `${opts.protocol}//${host}:${apiPort}${resolved}`;
  }
  return resolved;
}

describe("absoluteDownloadUrl (org backup)", () => {
  it("rewrites classic Vite 5173 to API :3000", () => {
    const url = absoluteDownloadUrlForTest("/api/v1/admin/org-backup/download?token=abc", {
      apiBase: "",
      hostname: "127.0.0.1",
      port: "5173",
      protocol: "http:",
    });
    assert.equal(url, "http://127.0.0.1:3000/api/v1/admin/org-backup/download?token=abc");
  });

  it("rewrites default branch web 5174 to API :3010", () => {
    const url = absoluteDownloadUrlForTest("/api/v1/admin/org-backup/download?token=abc", {
      apiBase: "",
      hostname: "localhost",
      port: "5174",
      protocol: "http:",
    });
    assert.equal(url, "http://localhost:3010/api/v1/admin/org-backup/download?token=abc");
  });

  it("rewrites main-branch web 5190 to API :3020", () => {
    const url = absoluteDownloadUrlForTest("/api/v1/admin/org-backup/download?token=abc", {
      apiBase: "",
      hostname: "127.0.0.1",
      port: "5190",
      protocol: "http:",
    });
    assert.equal(url, "http://127.0.0.1:3020/api/v1/admin/org-backup/download?token=abc");
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
