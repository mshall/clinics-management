# Kiorly launch — needs human

Items the autonomous build cannot finish without you. **STOP** entries block FINAL PHASE merge.

| ID | Step | Item | Severity | Status |
|----|------|------|----------|--------|
| NH-001 | FD-00 | Confirm with an Egyptian tax adviser: VAT on medical services (often exempt, pack uses `invoiceVatPercent: 0`) vs Kiorly SaaS (`saasVatPercent: 14`). | needs human | open |
| NH-002 | FD-02 | Confirm EN/AR wording on printed invoices/payment slips as clinic payment records (not tax e-receipts). | needs human | closed |
| NH-003 | CR-11 | Approve a Meta WhatsApp template (EN + AR) for the monthly statement message (`billing.monthly_statement_ready`) before the outbox sender is switched on. | needs human | open |
| NH-004 | SB-06 | Approve the bilingual price-change notice wording (EN + AR, consent-by-continuing) and a Meta WhatsApp/email template for `billing.price_change_notice` before the sender is switched on; confirm the 30-day notice period with counsel. | needs human | open |
| NH-005 | ON-06 | Approve a Meta WhatsApp template (EN + AR) and transactional email copy for staff invitations (`staff.invitation`, includes accept link, 7-day expiry) before the INTERNAL outbox sender is switched on. Until then owners share the copyable link. | needs human | open |
