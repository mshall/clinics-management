// Copied from kiorex-platform apps/api/src/common/providers/vendors/paymob.ts (repo convention: vendor wire-format code is copied, never imported across repos). Adapted for Kiorly Clinic where marked.
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Paymob Accept (Egypt), Intention API + unified checkout.
 *   env: PAYMOB_API_URL (default https://accept.paymob.com), PAYMOB_SECRET_KEY (egy_sk_..., server), PAYMOB_PUBLIC_KEY (egy_pk_..., checkout),
 *        PAYMOB_HMAC_SECRET (Dashboard > Settings > HMAC), PAYMOB_INTEGRATION_IDS (comma list of card / wallet integration ids)
 *   checkout: POST /v1/intention/  Authorization: Token <secret key>  { amount (piasters), currency, payment_methods:[ids], items, billing_data, special_reference: <paymentId>,
 *             notification_url, redirection_url } -> { client_secret, intention_order_id }; hosted page = {API}/unifiedcheckout/?publicKey=&clientSecret=
 *   webhook (processed callback): POST {type:'TRANSACTION', obj:{...}} ?hmac=<sha512>. HMAC-SHA512(PAYMOB_HMAC_SECRET) over the documented field concatenation, see PAYMOB_HMAC_FIELDS.
 *   refund: POST /api/acceptance/void_refund/refund  { transaction_id, amount_cents }  (transaction id found via /api/ecommerce/orders/transaction_inquiry).
 */
export const PAYMOB_HMAC_FIELDS = ['amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success'] as const;
const dig = (o: any, p: string) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

export const paymobHmacString = (obj: any) => PAYMOB_HMAC_FIELDS.map((f) => { const v = dig(obj, f); return v === undefined || v === null ? '' : String(v); }).join('');
export const paymobHmac = (secret: string, obj: any) => createHmac('sha512', secret).update(paymobHmacString(obj), 'utf8').digest('hex');
export function verifyPaymobHmac(secret: string, obj: any, given: string): boolean {
  if (!secret || !given) return false;
  const a = Buffer.from(given.toLowerCase()); const b = Buffer.from(paymobHmac(secret, obj));
  return a.length === b.length && timingSafeEqual(a, b);
}

export const paymobAuth = (secretKey: string) => ({ authorization: `Token ${secretKey}` });
export function paymobIntentionBody(i: { paymentId: string; amountMinor: number; currency: string; integrationIds: number[]; notificationUrl: string; redirectionUrl: string; customerEmail?: string }) {
  return {
    amount: i.amountMinor, currency: i.currency, payment_methods: i.integrationIds, special_reference: i.paymentId,
    items: [{ name: 'Kiorly subscription', amount: i.amountMinor, description: 'Kiorly', quantity: 1 }],
    billing_data: { first_name: 'Kiorly', last_name: 'Clinic', email: i.customerEmail || 'noreply@kiorly.com', phone_number: 'NA', apartment: 'NA', floor: 'NA', street: 'NA', building: 'NA', shipping_method: 'NA', postal_code: 'NA', city: 'NA', country: 'EG', state: 'NA' }, // no patient data is sent to the PSP
    notification_url: i.notificationUrl, redirection_url: i.redirectionUrl,
  };
}
export function parsePaymobIntention(json: any, apiUrl: string, publicKey: string): { pspRef: string; checkoutUrl: string } {
  const cs = json?.client_secret; const order = json?.intention_order_id ?? json?.id;
  if (typeof cs !== 'string' || !cs || order === undefined) throw new Error('no client_secret / order id in Paymob response');
  return { pspRef: String(order), checkoutUrl: `${apiUrl.replace(/\/+$/, '')}/unifiedcheckout/?publicKey=${encodeURIComponent(publicKey)}&clientSecret=${encodeURIComponent(cs)}` };
}

export interface PspEvent { eventId: string; type: 'payment.captured' | 'payment.failed' | 'refund.settled'; pspRef: string; paymentId?: string; amountMinor: number; feeMinor?: number; occurredAt: string }
/** `raw` is the verified callback body; returns null for non-transaction or still-pending callbacks. */
export function parsePaymobCallback(raw: string | object): PspEvent | null {
  let j: any; try { j = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  const o = j?.obj; if (j?.type !== 'TRANSACTION' || !o || !Number.isInteger(o.amount_cents) || o.id === undefined) return null;
  const orderId = String(o.order?.id ?? ''); const paymentId = o.order?.merchant_order_id ? String(o.order.merchant_order_id) : undefined;
  const occurredAt = o.created_at ? new Date(String(o.created_at).replace(/(\.\d+)?$/, (m) => (/[zZ+]/.test(String(o.created_at)) ? m : `${m}Z`))).toISOString() : new Date().toISOString();
  const base = { eventId: `paymob_${o.id}`, amountMinor: o.amount_cents as number, occurredAt, paymentId };
  if (o.pending === true) return null;
  if (o.is_refunded === true && o.success === true) return { ...base, eventId: `${base.eventId}_refund`, type: 'refund.settled', pspRef: String(o.id) };
  if (o.is_voided === true) return null;
  if (o.success === true) return { ...base, type: 'payment.captured', pspRef: orderId };
  return { ...base, type: 'payment.failed', pspRef: orderId };
}
export const paymobRefundBody = (transactionId: string, amountMinor: number) => ({ transaction_id: Number(transactionId), amount_cents: amountMinor });
export function paymobTransactionIdFromInquiry(json: any): string {
  const id = json?.id ?? json?.data?.id; if (id === undefined) throw new Error('no transaction id in Paymob inquiry response'); return String(id);
}
