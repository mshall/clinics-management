import {
  isClientCurrentWithManifest,
  shouldPromptForNewBuild,
} from "@/lib/deploy-version-logic";

const BUILT_IN = (import.meta.env.VITE_BUILD_ID as string | undefined)?.trim() ?? "";
const BUILT_IN_AT = (import.meta.env.VITE_BUILD_BUILT_AT as string | undefined)?.trim() ?? "";

type Listener = (pendingBuildId: string | null) => void;

let pendingBuildId: string | null = null;
let mandatoryMinBuiltAt: string | null = null;
/** Last successful /build-id.json buildId (CloudFront SPA truth). */
let spaManifestBuildId: string | null = null;
/** Gate API-header prompts until we know whether the SPA is already current. */
let manifestChecked = false;
let deferredApiBuildId: string | null = null;
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

function noteRemoteBuild(remote: string | null | undefined): void {
  const id = remote?.trim() ?? "";
  if (
    !shouldPromptForNewBuild({
      clientBuildId: BUILT_IN,
      remoteBuildId: id,
      spaManifestBuildId,
    })
  ) {
    if (id && id === BUILT_IN) dismissPendingDeploy();
    if (isClientCurrentWithManifest(BUILT_IN, spaManifestBuildId)) dismissPendingDeploy();
    return;
  }
  if (pendingBuildId === id) return;
  pendingBuildId = id;
  notify();
}

/** Called from API client when the server reports a web build id (after AWS deploy). */
export function applyWebBuildIdFromHeader(headerValue: string | null): void {
  if (!import.meta.env.PROD || !BUILT_IN || BUILT_IN === "dev-local" || BUILT_IN.startsWith("dev-")) {
    return;
  }
  const remote = headerValue?.trim() || null;
  if (!remote) return;

  // Prefer /build-id.json over a possibly stale App Runner WEB_BUILD_ID (web-only deploys).
  if (!manifestChecked) {
    deferredApiBuildId = remote;
    return;
  }
  noteRemoteBuild(remote);
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
 * After AWS deploy: surface a new build via /build-id.json (SPA truth) and API headers.
 * Optional banner reload is user-only; mandatory min build reloads on navigation.
 */
export function startDeployVersionWatch(): void {
  if (!import.meta.env.PROD || !BUILT_IN || BUILT_IN === "dev-local" || BUILT_IN.startsWith("dev-")) {
    return;
  }

  // Drop one-shot reload query params so they do not stick in the address bar.
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("kiorly_build") || url.searchParams.has("_reload")) {
      url.searchParams.delete("kiorly_build");
      url.searchParams.delete("_reload");
      window.history.replaceState({}, "", url.toString());
    }
  } catch {
    /* ignore */
  }

  void checkBuildIdManifestOnce();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkBuildIdManifestOnce();
  });
}

async function checkBuildIdManifestOnce(): Promise<void> {
  try {
    const res = await fetch(`/build-id.json?_=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { buildId?: string; builtAt?: string };
    const remote = data.buildId?.trim() || null;
    spaManifestBuildId = remote;
    if (data.builtAt) applyMinWebBuiltAtFromHeader(data.builtAt);

    if (isClientCurrentWithManifest(BUILT_IN, remote)) {
      dismissPendingDeploy();
    } else {
      noteRemoteBuild(remote);
    }
  } catch {
    // offline — retry next visibility / keep deferred API id
  } finally {
    manifestChecked = true;
    if (deferredApiBuildId) {
      const deferred = deferredApiBuildId;
      deferredApiBuildId = null;
      noteRemoteBuild(deferred);
    }
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
  // Bust any intermediate cache of the document shell.
  url.searchParams.set("_reload", String(Date.now()));
  window.location.replace(url.toString());
}
