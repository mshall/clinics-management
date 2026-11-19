import { SetMetadata } from "@nestjs/common";

export const REQUIRES_FEATURE_KEY = "requiresFeature";

/**
 * FF04 — gate a controller or handler on a feature flag. Apply to *new-action* entry points only; reads of
 * existing records must keep working when a flag is OFF. Never apply to ADR-025 safety controls.
 * Combine with `@UseGuards(JwtAuthGuard, FeatureGuard)`.
 */
export const RequiresFeature = (key: string) => SetMetadata(REQUIRES_FEATURE_KEY, key);
