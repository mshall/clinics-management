// Copied from kiorex-platform apps/api/src/common/providers/vendors/fawry.ts (repo convention: vendor wire-format code is copied, never imported across repos). Adapted for Kiorly Clinic where marked.
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Fawry (Egypt) FawryPay hosted checkout + callback v2 + refund API.
 *   env: FAWRY_API_URL (default https://www.atfawry.com; staging https://atfawry.fawrystaging.com), FAWRY_MERCHANT_CODE, FAWRY_SECURE_KEY
 *   checkout: redirect to {API}/ECommercePlugin/FawryPay.jsp?chargeRequest=<urlencoded JSON>, signature = sha256(merchantCode + merchantRefNum + customerProfileId + returnUrl + sum(itemId+quantity+price.2dp) + secureKey)
 *   callback: JSON with messageSignature = sha256(fawryRefNumber + merchantRefNumber + paymentAmount.2dp + orderAmount.2dp + orderStatus + paymentMethod + paymentRefrenceNumber + secureKey)
 *   refund: POST /ECommerceWeb/Fawry/payments/refund { merchantCode, referenceNumber, refundAmount, reason, signature = sha256(merchantCode + referenceNumber + refundAmount.2dp + reason + secureKey) }
 *   status: GET /ECommerceWeb/Fawry/payments/status/v2?merchantCode&merchantRefNumber&signature = sha256(merchantCode + merchantRefNumber + secureKey) -> fawryRefNumber
 */
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const major = (minor: number) => (minor / 100).toFixed(2);
const eq = (a: string, b: string) => { const x = Buffer.from(a.toLowerCase()); const y = Buffer.from(b.toLowerCase()); return x.length === y.length && timingSafeEqual(x, y); };

export function fawryCheckoutUrl(i: { apiUrl: string; merchantCode: string; secureKey: string; paymentId: string; amountMinor: number; returnUrl: string; webhookUrl: string; language?: 'ar-eg' | 'en-gb' }): { pspRef: string; checkoutUrl: string } {
  const item = { itemId: 'kiorly-subscription', description: 'Kiorly subscription', price: major(i.amountMinor), quantity: '1' };
  const signature = sha(`${i.merchantCode}${i.paymentId}${''}${i.returnUrl}${item.itemId}${item.quantity}${item.price}${i.secureKey}`);
  const chargeRequest = { merchantCode: i.merchantCode, merchantRefNum: i.paymentId, language: i.language ?? 'ar-eg', chargeItems: [item], returnUrl: i.returnUrl, orderWebHookUrl: i.webhookUrl, signature };
  return { pspRef: i.paymentId, checkoutUrl: `${i.apiUrl.replace(/\/+$/, '')}/ECommercePlugin/FawryPay.jsp?chargeRequest=${encodeURIComponent(JSON.stringify(chargeRequest))}` };
}
export const fawryCallbackSignature = (secureKey: string, b: any) => sha(`${b.fawryRefNumber}${b.merchantRefNumber}${Number(b.paymentAmount).toFixed(2)}${Number(b.orderAmount).toFixed(2)}${b.orderStatus}${b.paymentMethod}${b.paymentRefrenceNumber ?? ''}${secureKey}`);
export function verifyFawryCallback(secureKey: string, raw: string): any | null {
  let b: any; try { b = JSON.parse(raw); } catch { return null; }
  if (!secureKey || !b?.messageSignature || b.fawryRefNumber === undefined || !b.merchantRefNumber) return null;
  return eq(String(b.messageSignature), fawryCallbackSignature(secureKey, b)) ? b : null;
}
export function parseFawryCallback(b: any): { eventId: string; type: 'payment.captured' | 'payment.failed' | 'refund.settled'; pspRef: string; paymentId: string; amountMinor: number; feeMinor?: number; occurredAt: string } | null {
  const status = String(b?.orderStatus ?? '').toUpperCase();
  const type = status === 'PAID' ? 'payment.captured' : status === 'REFUNDED' || status === 'PARTIAL_REFUNDED' ? 'refund.settled' : status === 'FAILED' || status === 'CANCELED' || status === 'EXPIRED' ? 'payment.failed' : null;
  if (!type) return null; // NEW / DELIVERED carry no money movement
  const fees = Number(b.fawryFees);
  return { eventId: `fawry_${b.fawryRefNumber}_${status}`, type, pspRef: type === 'refund.settled' ? `${b.fawryRefNumber}` : String(b.merchantRefNumber), paymentId: String(b.merchantRefNumber), amountMinor: Math.round(Number(b.paymentAmount) * 100), ...(Number.isFinite(fees) && fees > 0 ? { feeMinor: Math.round(fees * 100) } : {}), occurredAt: b.paymentTime ? new Date(Number(b.paymentTime)).toISOString() : new Date().toISOString() };
}
export const fawryStatusUrl = (apiUrl: string, merchantCode: string, secureKey: string, merchantRefNumber: string) => `${apiUrl.replace(/\/+$/, '')}/ECommerceWeb/Fawry/payments/status/v2?merchantCode=${encodeURIComponent(merchantCode)}&merchantRefNumber=${encodeURIComponent(merchantRefNumber)}&signature=${sha(`${merchantCode}${merchantRefNumber}${secureKey}`)}`;
export const fawryRefundBody = (i: { merchantCode: string; secureKey: string; fawryRefNumber: string; amountMinor: number; reason?: string }) => { const reason = i.reason ?? 'Refund'; return { merchantCode: i.merchantCode, referenceNumber: i.fawryRefNumber, refundAmount: Number(major(i.amountMinor)), reason, signature: sha(`${i.merchantCode}${i.fawryRefNumber}${major(i.amountMinor)}${reason}${i.secureKey}`) }; };
