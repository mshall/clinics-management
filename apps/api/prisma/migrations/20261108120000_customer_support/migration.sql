-- Customer support tickets + enhanced audit indexes

CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED');
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "SupportProductModule" AS ENUM (
  'PATIENTS',
  'ENCOUNTERS',
  'APPOINTMENTS',
  'OPERATIONS',
  'EXPENSES',
  'REVENUE',
  'HR',
  'REPORTS',
  'ADMIN',
  'AUTH',
  'CLINICS',
  'BILLING',
  'OTHER'
);

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clinicId" TEXT,
  "ticketNo" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "module" "SupportProductModule" NOT NULL,
  "priority" "SupportTicketPriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "reporterUserId" TEXT,
  "assigneeUserId" TEXT,
  "patientId" TEXT,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "linkedAuditLogId" TEXT,
  "resolutionNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportTicketEvent" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "eventType" TEXT NOT NULL,
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupportTicketEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportTicket_tenantId_ticketNo_key" ON "SupportTicket"("tenantId", "ticketNo");
CREATE INDEX "SupportTicket_tenantId_status_createdAt_idx" ON "SupportTicket"("tenantId", "status", "createdAt");
CREATE INDEX "SupportTicket_tenantId_module_idx" ON "SupportTicket"("tenantId", "module");
CREATE INDEX "SupportTicket_tenantId_assigneeUserId_idx" ON "SupportTicket"("tenantId", "assigneeUserId");

CREATE INDEX "SupportTicketEvent_ticketId_createdAt_idx" ON "SupportTicketEvent"("ticketId", "createdAt");

CREATE INDEX "AuditLog_tenantId_actorId_idx" ON "AuditLog"("tenantId", "actorId");
CREATE INDEX "AuditLog_tenantId_resource_idx" ON "AuditLog"("tenantId", "resource");
CREATE INDEX "AuditLog_tenantId_action_idx" ON "AuditLog"("tenantId", "action");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
