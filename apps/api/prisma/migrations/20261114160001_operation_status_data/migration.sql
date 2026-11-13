-- Data migration after OperationStatus enum values are committed (separate migration).
UPDATE "Operation" SET status = 'BOOKED' WHERE status = 'SCHEDULED';
UPDATE "Operation" SET status = 'DISCHARGED' WHERE status = 'COMPLETED';
