UPDATE "UserMoneyVisibilityOverride"
SET "operationsOverride" = 'SHOW_VISIBILITY_ONLY'
WHERE "operationsOverride" = 'SHOW';

UPDATE "UserMoneyVisibilityOverride"
SET "encountersOverride" = 'SHOW_VISIBILITY_ONLY'
WHERE "encountersOverride" = 'SHOW';

UPDATE "UserMoneyVisibilityOverride"
SET "appointmentsOverride" = 'SHOW_VISIBILITY_ONLY'
WHERE "appointmentsOverride" = 'SHOW';

UPDATE "UserMoneyVisibilityOverride"
SET "operationsOverride" = 'HIDE_VISIBILITY_AND_EDIT'
WHERE "operationsOverride" = 'HIDE';

UPDATE "UserMoneyVisibilityOverride"
SET "encountersOverride" = 'HIDE_VISIBILITY_AND_EDIT'
WHERE "encountersOverride" = 'HIDE';

UPDATE "UserMoneyVisibilityOverride"
SET "appointmentsOverride" = 'HIDE_VISIBILITY_AND_EDIT'
WHERE "appointmentsOverride" = 'HIDE';