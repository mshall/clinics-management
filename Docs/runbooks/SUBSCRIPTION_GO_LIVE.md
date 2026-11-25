# Runbook: subscription go-live (SUB-01)

Scope: turning on recurring subscriptions with auto-renew and the Lite downgrade in a market. Nothing here is deployed by this repository; it is the checklist for the day the founder says go.

## Before go-live (all NEEDS_HUMAN, see KIORLY_NEEDS_HUMAN.md LG-SUB-1..6)
1. Prices exist for the market (Platform, Plans and pricing). Without a price the comparison table shows "Price to be confirmed" and the upgrade button stays disabled.
2. Counsel approved the renewal notice and the e-mail and WhatsApp copy; replace the engineering wording in `email-templates.ts` (`renderSubscriptionNotice`) and the Arabic strings in `plan-billing-strings.ts`.
3. Paymob (or the chosen PSP) approved recurring token charges; the adapter runs `MODE=real` only after that, in staging first. The renewal code never talks to the PSP directly: it uses `PaymentGateway.chargeToken` through the settlement invoice.
4. Approve the market subscription policy through maker-checker: Platform, Subscriptions, Subscription policy. One admin proposes, another approves. Check `autoRenewDefault` (true), `lapseAction` (DOWNGRADE_TO_LITE), `downgradeAfterDays` (> dunning grace), `liteReadOnlyGraceDays`, reminder days, proration timing.
5. Lite entitlements and limits reviewed on Platform, Plans and pricing (`max_clinicians`, `max_branches`, modules). A change to Lite affects every organisation that downgrades after the change.

## Go-live checks
- `GET /api/v1/billing/plans/compare` as an owner: all plans present, prices from the catalog, no raw numbers invented.
- A test organisation: switch auto-renew off (confirmation shows the impact), set `currentPeriodEnd` in the past, run the daily lifecycle (restart the API or call `SubscriptionLifecycleService.runDailyLifecycle`): organisation is on Lite, ACTIVE, data intact, `liteGrace` present on `/auth/me` (`planGrace`).
- Dunning: an issued invoice 16 days overdue leads to Lite with reason `dunning_exhausted`, a `downgrade_warning` notice the day before, and no READ_ONLY or SUSPENDED status event.
- Reminders: the dev inbox shows `billing.subscription_notice` rows only outside quiet hours (nextAttemptAt).
- Platform, Subscriptions: MRR, churn-lite and downgrade counts load; a forced action asks for a reason and appears in the audit log.

## Operating
- Customer asks to stay on the paid plan after a lapse: Platform, Subscriptions, "Force on" is for auto-renew; to restore a plan the owner uses **Plan and subscription** (Return to Pro) after paying the open invoice.
- Customer disputes a downgrade: the `SubscriptionEvent` trail (`downgraded_to_lite`, reason, actor) and the audit log hold the evidence.
- Never delete data to "enforce" Lite. Lite limits restrict seats and modules; they do not remove records.
- Rollback: set `lapseAction = READ_ONLY_SUSPEND` through maker-checker to return to the legacy dunning; organisations already on Lite stay there until they upgrade or support moves them.

## Known limits
- Annual intervals bill through the existing monthly settlement/prepaid logic; a dedicated annual renewal invoice is not built.
- `creditUnusedOnDowngrade` is stored but not applied.
- Pharmacy and Lab implement the same lifecycle in their own repos (see their Docs/SUBSCRIPTION.md).
