-- Per-organisation default sign-in method (ADR-038 amendment): which method the login page preselects. null = automatic (PASSPORT when linked to Kiorex).
CREATE TYPE "SignInMethod" AS ENUM ('PASSWORD', 'PASSPORT');
ALTER TABLE "Tenant" ADD COLUMN "defaultSignInMethod" "SignInMethod";
