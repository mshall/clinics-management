# Kiorly launch — needs human

Items the autonomous build cannot finish without you. **STOP** entries block FINAL PHASE merge.

| ID | Step | Item | Severity | Status |
|----|------|------|----------|--------|
| NH-001 | FD-00 | Confirm with an Egyptian tax adviser: VAT on medical services (often exempt, pack uses `invoiceVatPercent: 0`) vs Kiorly SaaS (`saasVatPercent: 14`). | needs human | open |
| NH-002 | FD-02 | Confirm EN/AR wording on printed invoices/payment slips as clinic payment records (not tax e-receipts). | needs human | closed |
| NH-003 | CR-11 | Approve a Meta WhatsApp template (EN + AR) for the monthly statement message (`billing.monthly_statement_ready`) before the outbox sender is switched on. | needs human | open |
| NH-004 | SB-06 | Approve the bilingual price-change notice wording (EN + AR, consent-by-continuing) and a Meta WhatsApp/email template for `billing.price_change_notice` before the sender is switched on; confirm the 30-day notice period with counsel. | needs human | open |
| NH-005 | ON-06 | Approve a Meta WhatsApp template (EN + AR) and transactional email copy for staff invitations (`staff.invitation`, includes accept link, 7-day expiry) before the INTERNAL outbox sender is switched on. Until then owners share the copyable link. | needs human | open |
| NH-006 | ON-07 | Approve the bilingual owner-confirmation OTP message (sent when a field rep creates a clinic) and a Meta WhatsApp/email template for `rep.owner_welcome` (set-password link) before the INTERNAL outbox sender is switched on; set each market's `commercialConfig.salesRep` commission % and retention days (default 10 % / 90 days). | needs human | open |
| NH-007 | ON-08 | Record five 60-second Arabic how-to videos (book appointment, check-in & payment, write & finalize a visit, import patients, invite team), host them and set `VITE_HELP_VIDEO_BASE_URL` (files `<id>-ar.mp4`); until then the Help drawer lists them as coming soon. | needs human | open |
| NH-008 | KX-09 | Get the Kiorex booking-widget origin from Kiorex and set `KIOREX_BOOKING_WIDGET_URL`; register/point the short domain (e.g. `kiorly.link`) at the web app and set `BOOKING_LINK_BASE_URL`. Until then links use `${APP_WEB_URL}/b/<slug>` and the page offers "Call to book". | needs human | open |
