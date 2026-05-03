-- Optional receipt / proof attachment for expenses
ALTER TABLE "Expense" ADD COLUMN "proofRelativePath" TEXT;
ALTER TABLE "Expense" ADD COLUMN "proofOriginalName" TEXT;
ALTER TABLE "Expense" ADD COLUMN "proofMimeType" TEXT;
