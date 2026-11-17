-- CL-02: ingredient-keyed interaction rules + Rx safety override on encounter meds
ALTER TABLE "DrugInteractionRule" ADD COLUMN "ingredientA" TEXT;
ALTER TABLE "DrugInteractionRule" ADD COLUMN "ingredientB" TEXT;

UPDATE "DrugInteractionRule"
SET
  "ingredientA" = lower(trim("drugA")),
  "ingredientB" = lower(trim("drugB"));

ALTER TABLE "DrugInteractionRule" ALTER COLUMN "ingredientA" SET NOT NULL;
ALTER TABLE "DrugInteractionRule" ALTER COLUMN "ingredientB" SET NOT NULL;

UPDATE "DrugInteractionRule" SET "severity" = 'major' WHERE "severity" = 'high';

CREATE INDEX "DrugInteractionRule_ingredientA_ingredientB_idx" ON "DrugInteractionRule"("ingredientA", "ingredientB");

ALTER TABLE "EncounterMedication" ADD COLUMN "safetyOverrideReason" TEXT;