import { FeatureDisabledException } from "./feature-disabled.exception";
import type { FeatureFlagsService } from "./feature-flags.service";

/** Service-level equivalent of `@RequiresFeature` for new actions that have no controller entry point. */
export async function requireFeature(flags: FeatureFlagsService, tenantId: string | null, key: string): Promise<void> {
  const res = await flags.evaluate(tenantId, key);
  if (res.effective || res.source === "plan") return;
  throw new FeatureDisabledException(key, res.scope ?? "global");
}
