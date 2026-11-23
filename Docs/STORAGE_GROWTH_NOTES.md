# Storage growth — working notes

Branch: `feat/storage-growth` (from `kiorex`). No apply / no merge to `main`.

## Section 1 — context map (read before coding)

- **`upload-blob.storage.ts`**: Port `UploadBlobStorage` (`put` / `assertExists` / `getReadStream` / `deleteObject`); `relativeKey` is tenant-scoped DB value.
- **`local-upload-blob.storage.ts`**: Dev driver under `uploadRoot/<kind>/<relativeKey>`.
- **`storage.module.ts`**: Global Nest module; `UPLOAD_STORAGE=s3` → `S3UploadBlobStorage`, else local.
- **`upload-kind.ts`**: Prefix namespaces (`patients`, `encounters`, `operations`, `imports`, …).
- **`object-storage.s3.adapter.ts`**: Key = `<kind>/<relativeKey>`; SSE-S3 `AES256` on put.
- **`upload-errors.ts`**: `MAX_UPLOAD_BYTES = 15 MB` + i18n `messageKey` helpers.
- **`patients.service.ts`**: Document put/download/hard-delete/crop; national-id path; encounter docs — all via `this.uploads.*` with tenantId in path.
- **Prisma**: `PatientDocument` / `EncounterDocument` / `OperationDocument` / `PatientClinicalPhoto` hold `sizeBytes` + `relativePath`; other `*RelativePath` fields elsewhere (logos, avatars, proofs, …).
- **Usage**: Monthly `UsageCounter` + `UsageMetric` (not a storage gauge); 80% warn; `USAGE_QUOTA_EXCEEDED`. Storage metering is Phase 2 (separate tables).
- **`enhance-image.ts`**: Client pica resize (document long edge 1600, q=0.8; skip under ~2 MB).
- **Tofu `object-storage`**: Already has block-public, TLS deny, versioning, SSE-S3/KMS, abort-multipart 7d, noncurrent expiry (no `newer_noncurrent_versions`), optional prefix expiry. Missing: delete-markers, Intelligent-Tiering, CORS, inventory, growth alarm.
- **CDK `ApiUploadsBucket`**: Still the **live** App Runner uploads bucket (versioning **off**, no lifecycle). Mirror Phase 1 rules here; Tofu not applied yet.
- **Observability**: SNS `alerts_topic_arn` created after App Runner — uploads module cannot depend on it; wire growth alarm in product-stack after obs.
- **Scheduler pattern**: `plans/price-indexation.scheduler.ts` for later worker jobs (Phases 3–7).
- **e2e**: workspace `e2e/` for Phase 5+ cross-product scenario.

## Dr Ahmed Shall / production uploads (mandatory)

Phase 1 **does not delete** live clinic documents in S3:

- CDK `ApiUploadsBucket`: `RemovalPolicy.RETAIN`, versioning enabled in place, **no** `autoDeleteObjects`.
- Lifecycle never sets current-version expiry on `patients/`, `encounters/`, or `operations/` (only Intelligent-Tiering + noncurrent cleanup after 90d).
- `imports/` / `pending/` expiry is staging-only prefixes — not patient charts.
- App Runner / SPA deploy does not empty the uploads bucket; seed remains incremental-only.
- Guardrail test: `infra/src/data-residency-infra.node.test.ts` (“ApiUploadsBucket retains live clinic blobs”).

## Phase status

| Phase | Status |
|-------|--------|
| 1 S3 lifecycle / hygiene | Implemented (IaC; ships with main CDK deploy as in-place bucket UPDATE) |
| 2–7 | Not started |

## PROPOSAL defaults (configurable)

| Knob | Default |
|------|---------|
| `noncurrent_version_expiration_days` | 90 |
| `newer_noncurrent_versions` | 3 |
| `intelligent_tiering_after_days` | 30 |
| `intelligent_tiering_min_bytes` | 131072 |
| `imports_expiration_days` | 30 |
| `pending_expiration_days` | 1 (Phase 5 prep) |
| `storage_growth_alarm_percent` | 30 (7-day) |
| CORS `allowed_origins` | `[]` (no CORS resource until Phase 5 origins set) |
| `enable_inventory` | false |

## NEEDS_HUMAN (ask before changing)

1. Confirm retention years / document classes (Phase 4) — DPO/legal.
2. Confirm plan storage limits (Phase 2 PROPOSAL: 2 GB / 20 GB / 100 GB / 1 TB).
3. Confirm `keepOriginalUploads` default `false` (Phase 3).
4. Confirm lossy PDF (`storage.pdf.lossy`) stays off.
5. GuardDuty Malware Protection for S3 — when to enable (Phase 5 hook only for now).
