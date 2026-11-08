import type { IntegrationScope } from "@prisma/client";

export type IntegrationPrincipal = {
  id: string;
  clientKey: string;
  tenantId: string;
  name: string;
  scopes: IntegrationScope[];
  allowedClinicIds: string[];
};

export const INTEGRATION_BEARER_PREFIX = "kio_live.";
