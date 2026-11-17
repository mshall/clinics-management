import { SetMetadata } from "@nestjs/common";

export const REQUIRES_ENTITLEMENT_KEY = "requiresEntitlement";

export const RequiresEntitlement = (entitlement: string) => SetMetadata(REQUIRES_ENTITLEMENT_KEY, entitlement);