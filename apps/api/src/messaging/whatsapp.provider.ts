export type WhatsAppSendResult = { ok: true } | { ok: false; error: string };

export async function sendWhatsAppMessage(toPhone: string, body: string): Promise<WhatsAppSendResult> {
  const url = process.env.WHATSAPP_API_URL?.trim();
  const token = process.env.WHATSAPP_API_TOKEN?.trim();
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "WHATSAPP_API_URL or WHATSAPP_API_TOKEN not configured" };
    }
    return { ok: true };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to: toPhone.replace(/\s/g, ""), body, channel: "whatsapp" }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `WhatsApp API ${res.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}