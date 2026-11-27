-- Market lifecycle audit + optional second approver (founder decision 27 Nov 2026) and country immutability of organisations (decision A).
ALTER TABLE "Market" ADD COLUMN "requireSecondApprover" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MarketAuditEvent" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" "MarketLaunchStatus",
    "toStatus" "MarketLaunchStatus",
    "fromOperational" "MarketOperationalStatus",
    "toOperational" "MarketOperationalStatus",
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT,
    "actorSource" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approvalRef" TEXT,
    "approvalLink" TEXT,
    "secondApproverId" TEXT,
    "requestId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketAuditEvent_marketId_createdAt_idx" ON "MarketAuditEvent"("marketId", "createdAt");
CREATE INDEX "MarketAuditEvent_marketCode_createdAt_idx" ON "MarketAuditEvent"("marketCode", "createdAt");

CREATE TABLE "MarketChangeRequest" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "marketCode" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT NOT NULL,
    "approvalRef" TEXT,
    "approvalLink" TEXT,
    "requestedBy" TEXT NOT NULL,
    "requestedEmail" TEXT,
    "requestedSource" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedBy" TEXT,
    "decidedEmail" TEXT,
    "decidedSource" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketChangeRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketChangeRequest_marketId_status_createdAt_idx" ON "MarketChangeRequest"("marketId", "status", "createdAt");

-- Append-only: a correction is a new row.
CREATE OR REPLACE FUNCTION kx_market_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'MarketAuditEvent is append-only: % is not allowed (insert a new row)', TG_OP USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "MarketAuditEvent_append_only" BEFORE UPDATE OR DELETE ON "MarketAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION kx_market_audit_append_only();

-- Decision A: an organisation belongs to its country for life. Once Tenant.marketId is set it cannot point at another market.
-- (null -> value stays allowed so a legacy organisation can be bound once.) A correction is the documented super-admin data fix:
--   ALTER TABLE "Tenant" DISABLE TRIGGER "Tenant_market_immutable"; UPDATE ...; ALTER TABLE "Tenant" ENABLE TRIGGER "Tenant_market_immutable";
CREATE OR REPLACE FUNCTION kx_tenant_market_immutable() RETURNS trigger AS $$
BEGIN
  -- the foreign key's own SET NULL after a market row was deleted is not a move to another market (the API never deletes a market that has organisations)
  IF OLD."marketId" IS NOT NULL AND NEW."marketId" IS NULL AND NOT EXISTS (SELECT 1 FROM "Market" WHERE id = OLD."marketId") THEN
    RETURN NEW;
  END IF;
  IF OLD."marketId" IS NOT NULL AND NEW."marketId" IS DISTINCT FROM OLD."marketId" THEN
    RAISE EXCEPTION 'ORG_MARKET_IMMUTABLE: an organisation belongs to its country market for life (Tenant.marketId cannot change)' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Tenant_market_immutable" BEFORE UPDATE OF "marketId" ON "Tenant"
  FOR EACH ROW EXECUTE FUNCTION kx_tenant_market_immutable();
