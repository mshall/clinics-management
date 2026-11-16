const BUILT_IN = (import.meta.env.VITE_BUILD_ID as string | undefined)?.trim() ?? "";

type Listener = (pendingBuildId: string | null) => void;

let pendingBuildId: string | null = null;
const listeners = new Set<Listener>();

export function subscribeDeployVersion(listener: Listener): () => void {
  listeners.add(listener);
  listener(pendingBuildId);
  return () => listeners.delete(listener);
}

export function getPendingDeployBuildId(): string | null {
  return pendingBuildId;
}

function notify(): void {
  for (const l of listeners) l(pendingBuildId);
}

export function dismissPendingDeploy(): void {
  pendingBuildId = null;
  notify();
}

function noteNewBuild(remote: string): void {
  if (!remote || remote === BUILT_IN || pendingBuildId === remote) return;
  pendingBuildId = remote;
  notify();
}

/** Called from API client when the server reports a newer web bundle (after AWS deploy). */
export function applyWebBuildIdFromHeader(headerValue: string | null): void {
  if (!import.meta.env.PROD || !BUILT_IN || BUILT_IN === "dev-local" || BUILT_IN.startsWith("dev-")) {
    return;
  }
  const remote = headerValue?.trim();
  if (remote) noteNewBuild(remote);
}

export function observeWebBuildIdHeader(res: Response): void {
  applyWebBuildIdFromHeader(res.headers.get("X-Kiorly-Web-Build-Id"));
}

/** Reload only when the user explicitly chooses — never on navigation or idle. */
export function tryApplyDeployReload(reason: "user"): boolean {
  if (!pendingBuildId) return false;
  if (reason !== "user") return false;
  void forceHardReload(pendingBuildId);
  return true;
}

/**
 * After AWS deploy: surface a new build via API headers / optional build-id check on tab focus.
 * Does not force reload while forms or payments are in progress.
 */
export function startDeployVersionWatch(): void {
  if (!import.meta.env.PROD || !BUILT_IN || BUILT_IN === "dev-local" || BUILT_IN.startsWith("dev-")) {
    return;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkBuildIdManifestOnce();
  });
}

async function checkBuildIdManifestOnce(): Promise<void> {
  if (pendingBuildId) return;
  try {
    const res = await fetch(`/build-id.json?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { buildId?: string };
    applyWebBuildIdFromHeader(data.buildId ?? null);
  } catch {
    // offline — retry next visibility
  }
}

async function forceHardReload(nextBuildId: string): Promise<void> {
  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* ignore */
    }
  }
  const url = new URL(window.location.href);
  url.searchParams.set("kiorly_build", nextBuildId);
  window.location.replace(url.toString());
}