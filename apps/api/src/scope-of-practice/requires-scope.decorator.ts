import { SetMetadata } from "@nestjs/common";
import type { ScopeCapability } from "./scope-capabilities";

export const REQUIRES_SCOPE_KEY = "requiresScope";

/**
 * PRSOP — server-side scope-of-practice check, beside `@RequiresEntitlement`. Combine with
 * `@UseGuards(JwtAuthGuard, ScopeGuard)`. The capability must exist in SCOPE_CAPABILITIES (CI-enforced).
 */
export const RequiresScope = (capability: ScopeCapability) => SetMetadata(REQUIRES_SCOPE_KEY, capability);
