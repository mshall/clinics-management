/** Pure builders for the staff "Share" actions on a telehealth link (WhatsApp / SMS, prefilled). */
export function digitsOnly(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export function whatsappShareUrl(phone: string | null | undefined, text: string): string {
  const d = phone ? digitsOnly(phone) : "";
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export function smsShareUrl(phone: string | null | undefined, text: string): string {
  const d = phone ? phone.replace(/[^\d+]/g, "") : "";
  // "?&body=" works on both iOS and Android sms: handlers
  return `sms:${d}?&body=${encodeURIComponent(text)}`;
}

export function shareMessage(parts: { name: string; clinic: string; when: string; link: string; lang: "en" | "ar" }): string {
  return parts.lang === "ar"
    ? `مرحباً ${parts.name}، رابط زيارتك بالفيديو مع ${parts.clinic} (${parts.when}): ${parts.link}`
    : `Hello ${parts.name}, here is your video visit link with ${parts.clinic} (${parts.when}): ${parts.link}`;
}
