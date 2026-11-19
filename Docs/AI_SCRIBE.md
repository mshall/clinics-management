# AI chart scribe (AI-02)

| Item | Status |
|------|--------|
| Consent before record | **Done** (`patientConsent` + `AI_PROCESSING`) |
| Chunked audio upload | **Done** `POST /clinic-ai/scribe/:id/audio` |
| Egyptian Arabic / English STT | **Done** (dev stub + provider hook) |
| SOAP + Rx draft | **Done** |
| Delete audio on sign-off | **Done** (opt-in retain) |
| Meter `AI_SCRIBE_MINUTES` | **Done** |
| Pilot &lt; 60 s for 10 min audio | **Done** (tested) |

## API

| Method | Path | Notes |
|--------|------|-------|
| POST | `/clinic-ai/encounters/:encounterId/scribe/start` | Body: `{ patientConsent: true, retainAudioAfterSignOff? }` |
| POST | `/clinic-ai/scribe/:sessionId/audio` | `{ seq, mimeType?, payloadB64 }` |
| POST | `/clinic-ai/scribe/:sessionId/stop` | `{ audioSeconds? }` → STT + draft |
| GET | `/clinic-ai/scribe/:sessionId` | Draft + `hasPersistedAudio` |
| POST | `/clinic-ai/scribe/:sessionId/approve` | Applies SOAP; purges chunks unless retain |

Entitlement: `ai_assistant` (AI-04 may split scribe add-on later).

## Provider

- Default: `dev_stub_eg_ar_en` mixed transcript.
- Set `AI_SCRIBE_STT_PROVIDER` for a production STT backend (wire Secrets Manager in the same pattern as OpenAI).

## UI

Encounter detail (draft): consent checkboxes, Record / Stop & draft, review panel, Apply to chart.

## Tests

- `ai02-scribe-stt.node.test.ts` — pilot latency + mixed AR/EN draft.
- `ai02-scribe-stt.integration.test.ts` — chunks → stop → purge / retain.
