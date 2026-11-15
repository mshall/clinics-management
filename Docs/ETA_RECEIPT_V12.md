# ETA e-Receipt v1.2 (Egypt)

Platform support for Egypt **Receipt v1.2**: wire document builder, **content-hash UUIDs** (SHA-256 over ETA-serialized JSON), and a **per-POS-device** receipt chain. Authoritative spec: [ETA SDK — Receipt v1.2](https://sdk.invoicing.eta.gov.eg/documents/receipt-v1-2/) and [serialization](https://sdk.invoicing.eta.gov.eg/document-serialization-approach/).

## Lifecycle

| Phase | Behavior |
|--------|----------|
| **Queue** | `queueFiscalDocument` builds a **draft** with `receiptUuid: ""`. Resolves **ETA payment method** (`C` / `V` / `O`) from visit collection, billing allocations, market pack, or org **payment channels**. Uses patient name on buyer when available. |
| **Prepare** (short DB tx) | Lock device, assign `receiptNumber`, compute UUID, write **final** `payloadJson`, set status **`SUBMITTING`**. Does **not** call ETA inside the transaction. |
| **Submit** (network) | `submitEtaReceipt` uses the stored payload only — **never recomputes** UUID/timestamp on retry. |
| **Finalize** (short DB tx) | On success: advance device chain (`lastReceiptUuid`, `receiptSequence`), status `SUBMITTED`. On failure: keep `SUBMITTING`, backoff `nextRetryAt`, increment `submitAttempts`. |
| **Worker** | `FiscalSubmissionWorker` polls each active device FIFO (`PENDING` / `SUBMITTING`). Alerts via `IntegrationFailureLog` after repeated failures. Disable with `FISCAL_SUBMIT_WORKER=false`. |

Manual: `POST /api/v1/compliance/egypt/eta-queue/:id/submit` (same three-step path).

## Payment method codes

| Code | Meaning | Source |
|------|---------|--------|
| `C` | Cash | Visit cash, billing cash-only |
| `V` | Card | Billing with `CARD` allocation |
| `O` | Transfer / other | InstaPay, Fawry, org payment channels (configurable `fiscalPaymentCode` on `TenantPaymentChannel`) |

## Buyer name & privacy

- Check-in and visit fees pass the patient’s display name when known (not the literal `"Patient"`).
- Receipts **≥ EGP 150,000** require a real buyer name at submit (operations / high-value care).
- Sending patient names to ETA is a **data processing** step — document in your privacy notice.

## Receipt v1.2 body (wire)

Built in `buildEtaWireReceiptDocument` (`apps/api/src/compliance/eta-egypt-wire.ts`).

## UUID (content hash)

See `eta-egypt-serialize.ts`. Cross-check in ETA pre-production:

```bash
# After ETA toolkit returns UUID for the golden fixture:
ETA_GOLDEN_UUID_EXPECTED=<64-char-hex> npm run test:unit -w api
```

Fixture: `eta-sdk-golden-fixture.node.test.ts`.

## Per-device chain

State on **`FiscalDevice`** (`lastReceiptUuid`, `receiptSequence`). `previousUUID` taken at prepare time from the device row; chain advances only on successful finalize.

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

- `eta-receipt-v12.node.test.ts`, `eta-sdk-golden-fixture.node.test.ts`, `fiscal-payment-method.node.test.ts`

## Code map

| Component | Path |
|-----------|------|
| Queue | `fiscal-queue.ts` |
| Prepare / submit / finalize | `fiscal-submit.service.ts` |
| Background worker | `fiscal-submission.worker.ts` |
| Payment codes | `fiscal-payment-method.ts` |
| v1.2 builder | `eta-egypt-wire.ts` |
| Serialization / hash | `eta-egypt-serialize.ts` |