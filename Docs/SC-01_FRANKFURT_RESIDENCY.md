# SC-01 · Frankfurt data residency (product controls)

| Status | Partial — product gates in code; government approval ref is human (see `Docs/KIORLY_NEEDS_HUMAN.md`) |
|--------|------------------------------------------------------------------------------------------------------|

## Shipped

- `Market.legalConfig.crossBorderTransfer` + optional `pilotException` (Zod schema, platform admin API `GET/PUT …/legal-config`).
- LIVE + new-tenant gates for Path A markets (EG): `assertLiveMarketHasCrossBorderApproval`, `assertMarketReadyForCrossBorderLaunch`.
- Sub-processor allowlist on market feature-flag enable (`ai_assistant`, `whatsapp_reminders`, `card_payments`).
- Demo EG migration seeds closed-pilot legal pack (`20261118153000_sc01_eg_legal_config`).
- Platform **Market launch** tab: transfer approval column + legal config dialog (en + ar).
- Tests: `sc01-legal-config.node.test.ts`, `market-pack-validation.node.test.ts`; existing `data-residency*.test.ts`, `infra/data-residency-infra.node.test.ts`.

## Follow-ups

- Replace `DEMO-SC-01-NON-PROD` with real PDPC approval ref before production PHI.
- Platform admin alert job 60 days before `expiresAt`.
- Public sub-processor page in legal catalog (beyond `Docs/SUB_PROCESSORS_BY_MARKET.md`).
- Drop `Market.dataRegion` Prisma column default (named migration).
- Strengthen DPA copy with Germany/EU hosting + approval ref.