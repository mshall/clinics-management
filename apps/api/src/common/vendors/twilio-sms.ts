import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Twilio Programmable Messaging (SMS). SMS_API_URL=https://api.twilio.com ; SMS_API_KEY="<AccountSid>:<AuthToken>" (Basic auth).
 *   send: POST /2010-04-01/Accounts/{sid}/Messages.json  form To, From (SMS_SENDER_ID: number or messaging-service / alphanumeric id), Body, StatusCallback -> { sid }
 *   status callback (form-encoded): MessageSid, MessageStatus queued|sent|delivered|undelivered|failed|read, ErrorCode;
 *   X-Twilio-Signature = base64(HMAC-SHA1(authToken, fullUrl + sorted(key+value))) where fullUrl = SMS_WEBHOOK_PUBLIC_URL.
 * Twilio is the documented reference vendor; an Egyptian aggregator speaking another wire format = another file next to this one.
 */
export const twilioCreds = (apiKey: string) => { const i = apiKey.indexOf(':'); return i > 0 ? { sid: apiKey.slice(0, i), token: apiKey.slice(i + 1) } : null; };
export const twilioAuth = (apiKey: string): Record<string, string> => ({ authorization: `Basic ${Buffer.from(apiKey).toString('base64')}` });
export const twilioPath = (apiKey: string) => `/2010-04-01/Accounts/${encodeURIComponent(twilioCreds(apiKey)?.sid ?? '')}/Messages.json`;
export function twilioForm(i: { to: string; from: string; body: string; statusCallback?: string }): Record<string, string> {
  const f: Record<string, string> = { To: i.to, Body: i.body };
  if (/^MG[0-9a-f]{32}$/i.test(i.from)) f.MessagingServiceSid = i.from; else f.From = i.from;
  if (i.statusCallback) f.StatusCallback = i.statusCallback;
  return f;
}
export function parseTwilioSend(json: any): { providerRef: string } {
  if (typeof json?.sid !== 'string' || !json.sid) throw new Error('no sid in Twilio response');
  return { providerRef: json.sid };
}
export function verifyTwilioSignature(authToken: string, publicUrl: string, rawBody: string, headers: Record<string, unknown>): boolean {
  if (!authToken || !publicUrl) return false;
  const sig = String(Array.isArray(headers['x-twilio-signature']) ? headers['x-twilio-signature'][0] : headers['x-twilio-signature'] ?? '');
  const params = [...new URLSearchParams(rawBody).entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const expected = createHmac('sha1', authToken).update(publicUrl + params.map(([k, v]) => k + v).join(''), 'utf8').digest('base64');
  const x = Buffer.from(sig); const y = Buffer.from(expected);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const signTwilio = (authToken: string, publicUrl: string, rawBody: string) => createHmac('sha1', authToken).update(publicUrl + [...new URLSearchParams(rawBody).entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k, v]) => k + v).join(''), 'utf8').digest('base64');
export function parseTwilioStatus(raw: string): Array<{ providerRef: string; status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'; error?: string }> {
  const p = new URLSearchParams(raw); const id = p.get('MessageSid') ?? p.get('SmsSid'); const st = (p.get('MessageStatus') ?? p.get('SmsStatus') ?? '').toLowerCase();
  const status = st === 'sent' ? 'SENT' : st === 'delivered' ? 'DELIVERED' : st === 'read' ? 'READ' : st === 'failed' || st === 'undelivered' ? 'FAILED' : undefined;
  if (!id || !status) return [];
  return [{ providerRef: id, status, ...(status === 'FAILED' ? { error: `TWILIO_${p.get('ErrorCode') ?? 'FAILED'}` } : {}) }];
}
