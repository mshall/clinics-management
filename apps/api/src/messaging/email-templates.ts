/** Bilingual transactional email templates (MS-05). Keys are logical; SES/HTML is rendered here. */

export type EmailLocale = "en" | "ar";

export type EmailTemplateKey =
  | "trial_notification"
  | "kiorly_invoice_statement"
  | "password_reset"
  | "security_alert"
  | "weekly_report";

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
  locale: EmailLocale;
};

type Vars = Record<string, string | number | null | undefined>;

function v(vars: Vars, key: string, fallback = ""): string {
  const raw = vars[key];
  if (raw == null) return fallback;
  return String(raw);
}

function wrapHtml(locale: EmailLocale, title: string, body: string): string {
  const dir = locale === "ar" ? "rtl" : "ltr";
  return `<!DOCTYPE html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">${body}</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderEmailTemplate(
  key: EmailTemplateKey,
  locale: EmailLocale,
  vars: Vars,
): RenderedEmail {
  switch (key) {
    case "trial_notification":
      return renderTrial(locale, vars);
    case "kiorly_invoice_statement":
      return renderInvoice(locale, vars);
    case "password_reset":
      return renderPasswordReset(locale, vars);
    case "security_alert":
      return renderSecurity(locale, vars);
    case "weekly_report":
      return renderWeeklyReport(locale, vars);
    default: {
      const _exhaustive: never = key;
      throw new Error(`Unknown email template: ${_exhaustive}`);
    }
  }
}

function renderTrial(locale: EmailLocale, vars: Vars): RenderedEmail {
  const kind = v(vars, "kind", "trial_ending");
  const days = v(vars, "daysRemaining", "");
  const plan = v(vars, "planName", "Kiorly");
  if (locale === "ar") {
    const subject = kind === "trial_activated" ? `تم تفعيل تجربتك على ${plan}` : `تجربتك على ${plan} تقترب من الانتهاء`;
    const text =
      kind === "trial_activated"
        ? `مرحباً، تم تفعيل تجربتك على ${plan}. استمتع بكل الميزات خلال فترة التجربة.`
        : `مرحباً، متبقي ${days} يوماً على انتهاء تجربتك على ${plan}. حدّث خطتك من لوحة الفوترة لتجنب الانقطاع.`;
    const html = wrapHtml(locale, subject, `<p>${escapeHtml(text)}</p>`);
    return { subject, text, html, locale };
  }
  const subject = kind === "trial_activated" ? `Your ${plan} trial is active` : `Your ${plan} trial is ending soon`;
  const text =
    kind === "trial_activated"
      ? `Hi, your ${plan} trial is now active. Enjoy full access during the trial period.`
      : `Hi, your ${plan} trial ends in ${days} day(s). Update your plan under billing to avoid interruption.`;
  return { subject, text, html: wrapHtml(locale, subject, `<p>${escapeHtml(text)}</p>`), locale };
}

function renderInvoice(locale: EmailLocale, vars: Vars): RenderedEmail {
  const number = v(vars, "invoiceNumber", "");
  const period = v(vars, "periodKey", "");
  const total = v(vars, "total", "");
  const currency = v(vars, "currency", "");
  const path = v(vars, "statementPath", "");
  if (locale === "ar") {
    const subject = `فاتورة كيورلي ${number} — ${period}`;
    const text = `فاتورتك ${number} لفترة ${period} بمبلغ ${total} ${currency} جاهزة. حمّل البيان من لوحة الفوترة${path ? ` (${path})` : ""}.`;
    return { subject, text, html: wrapHtml(locale, subject, `<p>${escapeHtml(text)}</p>`), locale };
  }
  const subject = `Kiorly invoice ${number} — ${period}`;
  const text = `Your invoice ${number} for ${period} (${total} ${currency}) is ready. Download the statement from billing${path ? ` (${path})` : ""}.`;
  return { subject, text, html: wrapHtml(locale, subject, `<p>${escapeHtml(text)}</p>`), locale };
}

function renderPasswordReset(locale: EmailLocale, vars: Vars): RenderedEmail {
  const link = v(vars, "resetLink", "");
  if (locale === "ar") {
    const subject = "إعادة تعيين كلمة مرور كيورلي";
    const text = `استخدم هذا الرابط لإعادة تعيين كلمة المرور (صالح لمدة 30 دقيقة): ${link}`;
    return {
      subject,
      text,
      html: wrapHtml(locale, subject, `<p>استخدم <a href="${escapeHtml(link)}">هذا الرابط</a> لإعادة تعيين كلمة المرور (صالح 30 دقيقة).</p>`),
      locale,
    };
  }
  const subject = "Reset your Kiorly password";
  const text = `Use this link to reset your password (expires in 30 minutes): ${link}`;
  return {
    subject,
    text,
    html: wrapHtml(locale, subject, `<p>Use <a href="${escapeHtml(link)}">this link</a> to reset your password (expires in 30 minutes).</p>`),
    locale,
  };
}

function renderSecurity(locale: EmailLocale, vars: Vars): RenderedEmail {
  const event = v(vars, "event", "security_event");
  const detail = v(vars, "detail", "");
  if (locale === "ar") {
    const subject = "تنبيه أمني من كيورلي";
    const text = `حدث أمني على حسابك: ${event}. ${detail}`.trim();
    return { subject, text, html: wrapHtml(locale, subject, `<p>${escapeHtml(text)}</p>`), locale };
  }
  const subject = "Kiorly security alert";
  const text = `A security event on your account: ${event}. ${detail}`.trim();
  return { subject, text, html: wrapHtml(locale, subject, `<p>${escapeHtml(text)}</p>`), locale };
}

function renderWeeklyReport(locale: EmailLocale, vars: Vars): RenderedEmail {
  const keys = v(vars, "reportKeys", "payments");
  const link = v(vars, "exportPath", "/reports");
  if (locale === "ar") {
    const subject = "تقرير العيادة الأسبوعي";
    const text = `تقاريرك المجدولة جاهزة (${keys}). افتح التطبيق وصدّر من صفحة التقارير: ${link}`;
    return {
      subject,
      text,
      html: wrapHtml(locale, subject, `<p>${escapeHtml(text)}</p>`),
      locale,
    };
  }
  const subject = "Your weekly clinic report";
  const text = `Your scheduled reports are ready (${keys}). Open Reports in Kiorly to download: ${link}`;
  return {
    subject,
    text,
    html: wrapHtml(locale, subject, `<p>${escapeHtml(text)}</p>`),
    locale,
  };
}

export const EMAIL_TEMPLATE_KEYS: EmailTemplateKey[] = [
  "trial_notification",
  "kiorly_invoice_statement",
  "password_reset",
  "security_alert",
  "weekly_report",
];
