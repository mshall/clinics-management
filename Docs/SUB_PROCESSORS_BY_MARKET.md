# Sub-processors by market (SC-01)

Kiorly engages the following categories of **sub-processors** when hosting clinic data. Exact legal entities and DPA annexes are maintained for enterprise contracts; this table is the **product truth** for engineering and sales.

**Infrastructure cell** is defined in [`platform/data-cells.json`](../platform/data-cells.json). Egypt production (Path A) uses cell **`frankfurt`** (`eu-central-1`).

---

## Egypt (EG) — Path A (production)

| Sub-processor | Role | Data processed | Region / notes |
|---------------|------|----------------|----------------|
| **Amazon Web Services** | IaaS — RDS PostgreSQL, S3 (uploads + web), App Runner, CloudFront, Secrets Manager, CloudWatch, **SES** (transactional email: trial, invoices, password reset) | All tenant PHI/PII in the platform DB and object storage; logs (no PHI by policy); owner/staff email addresses for transactional mail | **`eu-central-1` (Frankfurt)** for primary DB, uploads, automated RDS backups, SES |
| **OpenAI** (optional) | AI assistant LLM | Redacted prompts only; gated by `ai_assistant` + consent | **EU API endpoint** per market `providerConfig` ([ASSISTANT_OPENAI_SETUP.md](./ASSISTANT_OPENAI_SETUP.md)) |
| **Egyptian Tax Authority (ETA)** | Fiscal e-receipt API | Receipt payloads (may include buyer name above threshold) | Egypt government endpoints (outbound from Frankfurt API) |
| **WhatsApp BSP** (optional) | Appointment reminders | Phone numbers, message templates | Provider-selected region; off by default for EG |

**Legal gate (Path A):** PDPC **controller/processor** registration + **cross-border transfer licence** before processing live Egyptian personal data in Frankfurt — [DATA_RESIDENCY_DECISION.md](./DATA_RESIDENCY_DECISION.md).

---

## Egypt (EG) — Path B (prepared, not active)

When cell **`cairo`** (`me-south-1`) is live, AWS row becomes **`me-south-1`** for DB, uploads, and backups. OpenAI remains EU endpoint unless contract specifies otherwise. ETA and WhatsApp rows unchanged (outbound integrations).

---

## KSA / UAE / EU (planned)

| Market | Planned cell | Primary AWS region (target) | Fiscal / health exchange |
|--------|--------------|-----------------------------|---------------------------|
| **KSA** | `riyadh` (TBD) | `me-south-1` or KSA sovereign cloud (TBD) | ZATCA, NPHIES (TBD) |
| **UAE** | `dubai` (TBD) | `me-central-1` (TBD) | FTA, NABIDH / Malaffi (TBD) |
| **EU** | `frankfurt` | `eu-central-1` | Country fiscal providers |

Update this table when a market goes **LIVE** on its own cell.

---

## Change control

- Update this file and [COMPLIANCE_CONTROLS.md](./COMPLIANCE_CONTROLS.md) when adding a sub-processor or changing region.
- Notify enterprise customers per DPA **sub-processor change** clause.