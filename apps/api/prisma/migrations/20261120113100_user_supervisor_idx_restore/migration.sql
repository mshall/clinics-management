-- Restores the index dropped by the previous diff-generated migration (schema declares @@index([supervisorUserId])).
CREATE INDEX IF NOT EXISTS "User_supervisorUserId_idx" ON "User"("supervisorUserId");
