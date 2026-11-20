-- Kiorly Work: plan entitlement `mobile_staff_app` (on for PRO, CLINIC, ENTERPRISE, NURSE_PRO, NURSE_AGENCY). Mirrors PLAN_MATRIX in src/entitlements/plans-matrix.ts.
INSERT INTO "PlanEntitlement" ("id", "planId", "key", "valueJson", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", 'mobile_staff_app', to_jsonb(p."key"::text IN ('PRO', 'CLINIC', 'ENTERPRISE', 'NURSE_PRO', 'NURSE_AGENCY')), now(), now()
FROM "Plan" p
ON CONFLICT ("planId", "key") DO NOTHING;
