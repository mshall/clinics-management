# Connect to Kiorex (Kiorly Clinic and Kiorly Nurse), ADR-040

Kiorly Clinic and Kiorly Nurse works fully on its own. **Connect to Kiorex** (`/kiorex/connect`) guides an organisation that started standalone through joining the marketplace later.

- **Checklist.** `GET /api/v1/kiorex/connect?clinicId=` returns the steps computed from real state, each `done | action_needed | waiting_kiorex | blocked`, with a deep link to fix it. Subscription, entitlement (`clinic.kiorex_listing`), a VERIFIED doctor, a bookable visit type with a fee, availability with slots, profile completeness (80 %), consent (terms version + fee acknowledgement; the fee sentence reads the published market schedule), optional telehealth or home visits.
- **Request.** `POST /api/v1/kiorex/connect/request` moves listings DRAFT -> PENDING_VERIFICATION and sends the signed, PHI-free request. The decision arrives on `PUT /marketplace/v1/connection/:orgRef` (signed marketplace API) and listings become LIVE automatically when every other gate is green. Organisations without `Tenant.providerSettings.kiorexConnect` (existing and imported ones) are legacy-connected and never gated; self-serve sign-up writes `STANDALONE`.
- **Secrets.** No credentials are exchanged: Kiorex already holds the Clinic marketplace client.
- **Status.** The product polls Kiorex with a status token it derives itself (HMAC of the organisation id); nothing is stored. Rejection returns the organisation to standalone.
- **After Go live.** The page offers to make Kiorex Passport the default sign-in (`defaultSignInMethod`) and to invite staff to link their phone.
- **Tests.** ``kiorex-connect.node.test.ts` (API and web)`; end to end: `e2e/test/22-standalone-connect.e2e.ts` in the workspace repo.
- **Not done / needs a human.** Counsel-approved terms and fee wording, real notification providers, real launch-gate evidence, the production signing of the request with a per-partner enrolment secret (today the Clinic uses the shared webhook secret and Pharmacy/Lab prove control of their API through the signed handshake).
