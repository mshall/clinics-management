// Copied from kiorex-platform apps/api/src/common/providers/vendors/sigv4.ts (repo convention: vendor wire-format code is copied, never imported across repos). Adapted for Kiorly Clinic where marked.
import { createHash, createHmac } from 'node:crypto';

/**
 * Minimal AWS Signature Version 4 signer (no @aws-sdk: ADR-028 keeps the SDK inside src/platform/adapters). Pure function of its inputs so it is unit-tested
 * against AWS's published "get-vanilla" / "post-vanilla" test vectors. Used by SES v2 and Amazon Location over plain HTTPS.
 */
export interface SigV4Input { method: string; url: string; body: string; region: string; service: string; accessKeyId: string; secretAccessKey: string; sessionToken?: string; headers?: Record<string, string>; now?: Date }

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (k: Buffer | string, s: string) => createHmac('sha256', k).update(s, 'utf8').digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function signV4(i: SigV4Input): Record<string, string> {
  const u = new URL(i.url);
  const d = (i.now ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const day = d.slice(0, 8);
  const hdrs: Record<string, string> = { ...Object.fromEntries(Object.entries(i.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])), host: u.host, 'x-amz-date': d };
  if (i.sessionToken) hdrs['x-amz-security-token'] = i.sessionToken;
  const names = Object.keys(hdrs).sort();
  const canonicalHeaders = names.map((n) => `${n}:${hdrs[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const query = [...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)] as const).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const path = u.pathname.split('/').map((s) => enc(decodeURIComponent(s))).join('/') || '/';
  const canonical = [i.method.toUpperCase(), path, query, canonicalHeaders, signedHeaders, sha256(i.body)].join('\n');
  const scope = `${day}/${i.region}/${i.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', d, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${i.secretAccessKey}`, day), i.region), i.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign, 'utf8').digest('hex');
  const out: Record<string, string> = { 'x-amz-date': d, authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
  if (i.sessionToken) out['x-amz-security-token'] = i.sessionToken;
  return out;
}

/** `eu-central-1` from `email.eu-central-1.amazonaws.com` / `places.geo.eu-central-1.amazonaws.com`; undefined when not an AWS host. */
export const awsRegionFromHost = (host: string): string | undefined => /\.([a-z]{2}(?:-[a-z]+)+-\d)\.amazonaws\.com(?:\.cn)?$/.exec(host)?.[1];
