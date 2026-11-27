/**
 * Pilot (sales) tenant admin e-mail domain. Lives next to the staging seed on purpose: the post-deploy seed Lambda image copies only
 * `src/staging` (see apps/api/Dockerfile.seed), so the seed catalogue must not import from `src/config`. `config/host-config.ts`
 * re-exports this so API code keeps one import path. Allow-listed in `config/host-literals.node.test.ts`.
 */
export const PILOT_EMAIL_DOMAIN_DEFAULT = "pilot.kiorly.com";

export function pilotEmailDomain(env: Record<string, string | undefined> = process.env): string {
  return (env.PILOT_EMAIL_DOMAIN ?? "").trim().toLowerCase() || PILOT_EMAIL_DOMAIN_DEFAULT;
}
