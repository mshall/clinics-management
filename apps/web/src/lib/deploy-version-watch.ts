const BUILT_IN = (import.meta.env.VITE_BUILD_ID as string | undefined)?.trim() ?? "";
const BUILT_IN_AT = (import.meta.env.VITE_BUILD_BUILT_AT as string | undefined)?.trim() ?? "";

type Listener = (pendingBuildId: string | null) => void;

let pendingBuildId: string | null = null;
let mandatoryMinBuiltAt: string | null = null;
const listeners = new Set<Listener>();

export function subscribeDeployVersion(listener: Listener): () => void {
  listeners.add(listener);
  listener(pendingBuildId);
  return () => listeners.delete(listener);
}

export function getPendingDeployBuildId(): string | null {
  return pendingBuildId;
}

export function isBelowMandatoryWebBuild(): boolean {
  if (!import.meta.env.PROD || !BUILT_IN_AT || !mandatoryMinBuiltAt) return false;
  return BUILT_IN_AT < mandatoryMinBuiltAt;
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

export function applyMinWebBuiltAtFromHeader(headerValue: string | null): void {
  mandatoryMinBuiltAt = headerValue?.trim() || null;
}

export function observeWebBuildIdHeader(res: Response): void {
  applyWebBuildIdFromHeader(res.headers.get("X-Kiorly-Web-Build-Id"));
  applyMinWebBuiltAtFromHeader(res.headers.get("X-Kiorly-Web-Min-Built-At"));
}

/** Reload when the user chooses, or when mandatory min build requires it. */
export function tryApplyDeployReload(reason: "user" | "mandatory"): boolean {
  if (reason === "mandatory") {
    void forceHardReload(pendingBuildId ?? BUILT_IN);
    return true;
  }
  if (!pendingBuildId) return false;
  void forceHardReload(pendingBuildId);
  return true;
}

/**
 * After AWS deploy: surface a new build via API headers / optional build-id check on tab focus.
 * Optional banner reload is user-only; mandatory min build reloads on navigation.
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
    const data = (await res.json()) as { buildId?: string; builtAt?: string };
    applyWebBuildIdFromHeader(data.buildId ?? null);
    if (data.builtAt) applyMinWebBuiltAtFromHeader(data.builtAt);
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