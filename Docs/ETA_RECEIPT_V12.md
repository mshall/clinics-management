# ETA e-Receipt v1.2 (Egypt)

Platform support for Egypt **Receipt v1.2**: wire document builder, **content-hash UUIDs** (SHA-256 over ETA-serialized JSON), and a **per-POS-device** receipt chain. Authoritative spec: [ETA SDK — Receipt v1.2](https://sdk.invoicing.eta.gov.eg/documents/receipt-v1-2/) and [serialization](https://sdk.invoicing.eta.gov.eg/document-serialization-approach/).

## Lifecycle

| Phase | Behavior |
|--------|----------|
| **Queue** | `queueFiscalDocument` builds a **draft** in `EtaEgyptFiscalProvider` with `receiptUuid: ""` (no random UUID). Binds `FiscalSubmission.deviceId` from the clinic’s first `ProviderCredential.deviceId` when present. |
| **Submit** | `FiscalSubmitService.submitOne` runs only for the **head** of the device queue (FIFO). Reads `previousUUID` from `FiscalPosChain` for `(tenant, clinic, provider, deviceId)`, builds Receipt **v1.2**, sets `header.uuid` to **SHA-256** of serialized body (uuid empty), signs, and POSTs with POS headers. On success, updates `FiscalPosChain.lastAcceptedUuid`. |

## Receipt v1.2 body (wire)

Built in `buildEtaWireReceiptDocument` (`apps/api/src/compliance/eta-egypt-wire.ts`):

- `documentTypeVersion` **1.2**, seller (RIN, branch, activity), **buyer** type `P`, **itemData** (EGS, unit `EA`), **taxTotals**, **paymentMethod**, totals, **deviceSerialNumber**
- `header`: `dateTimeIssued`, `receiptNumber`, `uuid`, `previousUUID`, `referenceUUID` (returns), `currency`, `exchangeRate`

## UUID (content hash)

1. Set `header.uuid` to `""`.
2. Serialize with `etaSerializeValue` (uppercase quoted keys; array elements repeat the array name).
3. `computeEtaReceiptUuid` → 64-character hex SHA-256.

Implemented in `apps/api/src/compliance/eta-egypt-serialize.ts`.

## Per-device chain

- **Not** per clinic — keyed by `ProviderCredential.deviceId` (POS serial registered with ETA).
- State table: `FiscalPosChain` (`lastAcceptedUuid` per device).
- First receipt on a device: `previousUUID` is `""`.
- HTTP: `posserial`, `pososversion`, `posmodelframework`, `presharedkey` on token and submit (`eta-egypt.client.ts`); values from Secrets Manager JSON or `ETA_POS_*` env (`eta-secret-resolver.ts`).

## API

| Endpoint | Role |
|----------|------|
| `POST /api/v1/compliance/egypt/eta-queue/:id/submit` | Submit one queued receipt (enforces device queue order) |
| `GET /api/v1/compliance/egypt/eta-queue` | Pending / rejected submissions |

## Configuration

1. Market **EG** with `eta-egypt` fiscal provider and `eta_receipts` flag.
2. Clinic `providerSettings["eta-egypt"]` (branch, activity, item codes) + TRN.
3. **`ProviderCredential`** per clinic: `providerKey=eta-egypt`, **`deviceId`** = POS serial, `secretRef` → ETA client + POS headers.

See [markets/egypt.md](./markets/egypt.md) for onboarding checklist.

## Tests

From repo root:

```bash
npm run test:unit -w api
```

Coverage includes:

- `eta-receipt-v12.node.test.ts` — v1.2 builder + hash + chain semantics
- `eta-egypt-wire.node.test.ts` — wire fields
- `eta-egypt-serialize.node.test.ts` — stable 64-hex UUID

## Code map

| Component | Path |
|-----------|------|
| Queue (no uuid at enqueue) | `apps/api/src/compliance/fiscal-queue.ts` |
| Submit + chain | `apps/api/src/compliance/fiscal-submit.service.ts` |
| v1.2 builder | `apps/api/src/compliance/eta-egypt-wire.ts` |
| Serialization / hash | `apps/api/src/compliance/eta-egypt-serialize.ts` |
| HTTP submit + POS headers | `apps/api/src/compliance/eta-egypt.client.ts` |
| Provider payload | `apps/api/src/providers/fiscal/eta-egypt.fiscal-provider.ts` |