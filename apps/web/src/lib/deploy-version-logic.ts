/**
 * Pure helpers for the deploy-version banner.
 *
 * After a web-only deploy the SPA (and /build-id.json) advance, but App Runner's
 * WEB_BUILD_ID header can stay on the previous full-deploy SHA. Treating that
 * stale header as "a newer build" makes Reload now loop forever.
 */

export function shouldPromptForNewBuild(input: {
  clientBuildId: string;
  remoteBuildId: string | null | undefined;
  /** Latest build id from /build-id.json when known. */
  spaManifestBuildId?: string | null;
}): boolean {
  const client = input.clientBuildId.trim();
  const remote = input.remoteBuildId?.trim() ?? "";
  if (!client || !remote || remote === client) return false;

  const manifest = input.spaManifestBuildId?.trim() ?? "";
  // Client already matches the published SPA — ignore a stale API header.
  if (manifest && manifest === client) return false;

  return true;
}

export function isClientCurrentWithManifest(
  clientBuildId: string,
  spaManifestBuildId: string | null | undefined,
): boolean {
  const client = clientBuildId.trim();
  const manifest = spaManifestBuildId?.trim() ?? "";
  return Boolean(client && manifest && client === manifest);
}
