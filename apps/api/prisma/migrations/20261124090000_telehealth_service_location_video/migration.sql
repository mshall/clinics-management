-- ADR-039 telehealth: new ServiceLocation value. Postgres cannot use a new enum value in the same transaction that adds it,
-- so this is its own migration; nothing here is backfilled and no existing row changes.
ALTER TYPE "ServiceLocation" ADD VALUE IF NOT EXISTS 'VIDEO';
