/** Public façade of the feature-flags module — import from here in other modules. */
export { FeatureFlagsService } from "./feature-flags.service";
export { FeatureGuard } from "./feature.guard";
export { RequiresFeature, REQUIRES_FEATURE_KEY } from "./requires-feature.decorator";
export { FeatureDisabledException, FEATURE_DISABLED } from "./feature-disabled.exception";
export { requireFeature } from "./require-feature";
export { specialtyTemplateFlagKey } from "./feature-flag-keys";

import type { FeatureFlagsService as Flags } from "./feature-flags.service";

/** Optional-service helper: services built without a flag service (unit tests) treat every flag as ON. */
export async function flagOn(flags: Flags | undefined, tenantId: string | null, key: string): Promise<boolean> {
  if (!flags) return true;
  return (await flags.evaluate(tenantId, key)).effective;
}
