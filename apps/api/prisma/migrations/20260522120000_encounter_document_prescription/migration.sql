-- Allow prescription uploads on encounters (alternative to structured medication list)
ALTER TYPE "EncounterDocumentKind" ADD VALUE 'PRESCRIPTION';
