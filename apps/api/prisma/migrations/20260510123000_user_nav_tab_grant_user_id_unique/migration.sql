-- One grant row per user (required for Prisma 1:1 with User.navTabGrant)
CREATE UNIQUE INDEX "UserNavTabGrant_userId_key" ON "UserNavTabGrant"("userId");
