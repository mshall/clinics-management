-- Speed tenant-scoped audit listings with clinic filter (insights + support tracking).
CREATE INDEX "AuditLog_tenantId_createdAt_clinicId_idx" ON "AuditLog"("tenantId", "createdAt", "clinicId");
