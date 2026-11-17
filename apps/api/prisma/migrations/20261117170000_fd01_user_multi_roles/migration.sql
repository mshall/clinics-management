-- FD-01: primary role + additionalRoles + single tenant owner

ALTER TABLE "User" ADD COLUMN "additionalRoles" "UserRole"[] NOT NULL DEFAULT ARRAY[]::"UserRole"[];
ALTER TABLE "User" ADD COLUMN "isTenantOwner" BOOLEAN NOT NULL DEFAULT false;

-- First group admin per tenant becomes owner (legacy single-role orgs)
UPDATE "User" u
SET "isTenantOwner" = true
FROM (
  SELECT DISTINCT ON ("tenantId") id
  FROM "User"
  WHERE "tenantId" IS NOT NULL
    AND "role" = 'GROUP_ADMIN'
    AND "deletedAt" IS NULL
  ORDER BY "tenantId", "createdAt" ASC
) pick
WHERE u.id = pick.id;

INSERT INTO "AuditLog" ("id", "tenantId", "action", "resource", "resourceId", "metadata", "createdAt")
SELECT
  'fd01-owner-' || u."id",
  u."tenantId",
  'TENANT_OWNER_BACKFILL',
  'user',
  u."id",
  jsonb_build_object('isTenantOwner', true),
  CURRENT_TIMESTAMP
FROM "User" u
WHERE u."isTenantOwner" = true AND u."tenantId" IS NOT NULL;