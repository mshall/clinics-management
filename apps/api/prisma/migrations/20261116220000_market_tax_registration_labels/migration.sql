-- Egypt market: localized tax authority labels for clinic settings and invoicing
UPDATE "Market"
SET "taxConfig" = "taxConfig" || '{
  "taxAuthorityNameEn": "Egyptian Tax Authority (ETA)",
  "taxAuthorityNameAr": "مصلحة الضرائب المصرية",
  "taxRegistrationLabelEn": "Tax registration number (RIN / TRN)",
  "taxRegistrationLabelAr": "الرقم الضريبي (RIN / TRN)",
  "licenseLabelEn": "Ministry of Health facility license",
  "licenseLabelAr": "رقم ترخيص المنشأة الصحية"
}'::jsonb
WHERE "code" = 'EG';