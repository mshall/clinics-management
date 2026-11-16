const BUILT_IN = (import.meta.env.VITE_BUILD_ID as string | undefined)?.trim() ?? "";
const POLL_MS = 45_000;

/** After AWS deploy, clients poll build-id.json and hard-reload when it changes. */
export function startDeployVersionWatch(): void {
  if (!import.meta.env.PROD || !BUILT_IN || BUILT_IN === "dev-local" || BUILT_IN.startsWith("dev-")) {
    return;
  }

  let reloading = false;

  async function check(): Promise<void> {
    if (reloading) return;
    try {
      const res = await fetch(`/build-id.json?_=${Date.now()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { buildId?: string };
      const remote = data.buildId?.trim();
      if (remote && remote !== BUILT_IN) {
        reloading = true;
        await forceHardReload(remote);
      }
    } catch {
      // offline or transient — retry on next poll
    }
  }

  void check();
  window.setInterval(() => void check(), POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
  window.addEventListener("focus", () => void check());
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