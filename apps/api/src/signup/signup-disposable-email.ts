const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "yopmail.com",
  "10minutemail.com",
  "trashmail.com",
  "getnada.com",
]);

export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return true;
  const domain = email.slice(at + 1).toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}