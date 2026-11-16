# ETA e-Receipt v1.2 (Egypt)

Platform support for Egypt **Receipt v1.2**: wire document builder, **content-hash UUIDs** (SHA-256 over ETA-serialized JSON), and a **per-POS-device** receipt chain. Authoritative spec: [ETA SDK — Receipt v1.2](https://sdk.invoicing.eta.gov.eg/documents/receipt-v1-2/) and [serialization](https://sdk.invoicing.eta.gov.eg/document-serialization-approach/).

## Lifecycle

| Phase | Behavior |
|--------|----------|
| **Queue** | `postRevenueWithFiscal` posts revenue and calls `queueFiscalDocument` in one transaction — check-in, billing, visit fee, **operation down payment / installments / discharge balance**. **Not** on tax invoice print. Skipped when org disables Kiorly ETA integration. **EGP ≥ 150,000** buyer name at payment time. |
| **Prepare** (short DB tx) | `FOR UPDATE` submission + device, verify FIFO head, set **lease** (`claimedUntil` / `claimedBy`), build wire **once** (`dateTimeIssued`, `internalID`, serial, UUID), persist **`eta-wire-v1`** payload, status **`SUBMITTING`**. No ETA HTTP inside the transaction. |
| **Submit** (network) | `submitEtaWireDocument` sends the **stored JSON unchanged** on every retry (same bytes, same UUID). |
| **Finalize** (short DB tx) | Success: advance device chain, `SUBMITTED`, poll **`providerValidationStatus`**. **4xx / validation:** `REJECTED`, admin alert, queue moves on. **5xx / network:** `SUBMITTING` + backoff. **Unclear:** longer backoff + status APIs when configured. |
| **Worker** | `FiscalSubmissionWorker` polls each active device FIFO; respects lease. Disable with `FISCAL_SUBMIT_WORKER=false`. Instance id: `FISCAL_WORKER_ID` or hostname. |

Manual: `POST /api/v1/compliance/egypt/eta-queue/:id/submit` (same three-step path).

## Kiorly ETA integration opt-out

**Void / delete revenue** must use `voidPostedRevenuesWithFiscalReturns`: **PENDING** sales are marked `CANCELLED` under row lock (race with worker → queue return); **SUBMITTING / SUBMITTED / ACCEPTED** queue a return with `returnForFiscalDocumentId` (reference UUID resolved at **prepare** from the sale’s stored document); **REJECTED** skips a return. Encounter delete voids, then **detaches** revenue (`encounterId` null)—never deletes rows linked to fiscal docs.

Group admin controls **ETA e-invoice integration** under **Administration → Organization & settings** (dedicated card, off by default for new Egypt orgs). When off, the org declares responsibility for tax-authority submission; clinic ETA fields stay hidden. When on, org defaults and per-clinic branch codes apply. Stored as `providerSettings["eta-egypt"].physicalReportingOptOut` + `physicalReportingConsentAt` (opt-out = integration disabled). Audited; billing UI shows a banner while opt-out is active.

**Failures:** HTTP **401/403** and token errors → device `CREDENTIALS_EXPIRED`, receipt stays `SUBMITTING`. Duplicate UUID → status check, not `REJECTED`. Validation **4xx** → `REJECTED`; fix via `POST …/eta-queue/:id/resubmit` with `referenceOldUUID`.

## Payment method codes

| Code | Meaning | Source |
|------|---------|--------|
| `C` | Cash | Visit cash, billing cash-only |
| `V` | Card | Billing with `CARD` allocation |
| `O` | Transfer / other | InstaPay, Fawry, org payment channels (configurable `fiscalPaymentCode` on `TenantPaymentChannel`) |

## Buyer name & privacy

- Check-in, billing, and visit fees pass the patient’s display name when known (not the literal `"Patient"`).
- Receipts **≥ EGP 150,000** require a real buyer name **when payment is taken** — `assertEtaBuyerNameAtPayment` in `eta-buyer-name.ts`.
- Sending patient names to ETA is a **data processing** step — document in your privacy notice.

## Receipt v1.2 body (wire)

Built in `buildEtaWireReceiptDocument` (`apps/api/src/compliance/eta-egypt-wire.ts`). Issue time is frozen at prepare via `issuedAt`.

Stored payload: `EtaStoredSubmissionPayload` (`eta-stored-submission.ts`).

## UUID (content hash)

See `eta-egypt-serialize.ts`. CI enforces a **hardcoded golden UUID** in `eta-sdk-golden-fixture.node.test.ts` (fixed `issuedAt`). Wire hash self-check: `eta-wired-hash.node.test.ts` + `assertWireUuidMatchesContentHash`.

## Per-device chain

State on **`FiscalDevice`** (`lastReceiptUuid`, `receiptSequence`). `previousUUID` taken at prepare time from the device row; chain advances only on successful finalize (not on `REJECTED`).

Return / void receipts use `referenceOldUUID` on the wire when `referenceReceiptUuid` is set.

## Notifications webhook

`POST /api/v1/integrations/fiscal/eta-egypt/notifications/:tenantId` — tenant id from **URL** (portal callback), `Authorization: ApiKey …` compared with `timingSafeEqual`.

## Configuration

1. Market **EG** + `eta_receipts` flag.
2. Clinic `providerSettings["eta-egypt"]` + TRN.
3. **`FiscalDevice`** with Secrets Manager credentials.

See [markets/egypt.md](./markets/egypt.md).

## Tests

```bash
npm run test:unit -w api
```

- `eta-wired-hash.node.test.ts`, `eta-sdk-golden-fixture.node.test.ts`, `fiscal-payment-method.node.test.ts`

## Code map

| Component | Path |
|-----------|------|
| Queue | `fiscal-queue.ts` |
| Prepare / submit / finalize | `fiscal-submit.service.ts` |
| Failure class | `eta-submit-classify.ts` |
| Background worker | `fiscal-submission.worker.ts` |
| Payment codes | `fiscal-payment-method.ts` |
| v1.2 builder | `eta-egypt-wire.ts` |
| Serialization / hash | `eta-egypt-serialize.ts` |
| HTTP submit | `eta-egypt.client.ts` (`submitEtaWireDocument`) |