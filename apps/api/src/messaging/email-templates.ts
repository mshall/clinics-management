/** Bilingual transactional email templates (MS-05). Keys are logical; SES/HTML is rendered here. */

export type EmailLocale = "en" | "ar";

export type EmailTemplateKey =
  | "trial_notification"
  | "subscription_notice"
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
    case "subscription_notice":
      return renderSubscriptionNotice(locale, vars);
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

/**
 * SUB-01 subscription notices. Wording is operational only (what happens and when); legal text is not here (LG-SUB-2).
 * Dates are rendered as YYYY-MM-DD; amounts are the catalog amounts for the period (never invented).
 */
function renderSubscriptionNotice(locale: EmailLocale, vars: Vars): RenderedEmail {
  const kind = v(vars, "kind", "renewal_reminder");
  const plan = v(vars, "planName", v(vars, "planKey", "Kiorly"));
  const date = v(vars, "renewsOn", v(vars, "endsOn", "")).slice(0, 10);
  const days = v(vars, "daysBefore", "");
  const amount = v(vars, "amount", "");
  const currency = v(vars, "currency", "");
  const money = amount ? `${amount} ${currency}`.trim() : "";
  const en: Record<string, [string, string]> = {
    renewal_reminder: [`Your ${plan} plan renews on ${date}`, `Your ${plan} plan renews automatically on ${date}${days ? ` (in ${days} day(s))` : ""}${money ? `, amount ${money}` : ""}. You can turn auto-renew off under Plan & billing.`],
    renewal_off_reminder: [`Your ${plan} plan ends on ${date}`, `Auto-renew is off. On ${date} your organization moves to the free Lite plan. Your data is kept. Turn auto-renew on under Plan & billing to stay on ${plan}.`],
    payment_method_missing: [`Add a payment method before ${date}`, `Your ${plan} plan renews on ${date} but no saved payment method was found. Add one under Plan & billing, otherwise the plan moves to Lite.`],
    payment_failed: [`Payment for your ${plan} plan failed`, `We could not collect your subscription payment. We will retry. If it stays unpaid, your organization moves to the free Lite plan (your data is kept). Pay under Plan & billing.`],
    downgrade_warning: [`Your plan moves to Lite tomorrow`, `The payment is still overdue. Tomorrow your organization moves to the free Lite plan. Your data is kept and you can upgrade again at any time.`],
    downgraded_to_lite: [`Your organization is now on the free Lite plan`, `Your subscription moved to Lite. Nothing was deleted. Modules Lite does not include stay readable for ${v(vars, "readOnlyGraceDays", "a few")} day(s). Upgrade under Plan & billing to restore them.`],
    auto_renew_off: [`Auto-renew is off`, `Your ${plan} plan stays active until ${date}, then moves to the free Lite plan. Your data is kept.`],
    auto_renew_on: [`Auto-renew is on`, `Your ${plan} plan renews automatically on ${date}.`],
    reactivated: [`Welcome back to ${plan}`, `Your organization is on the ${plan} plan again.`],
  };
  const ar: Record<string, [string, string]> = {
    renewal_reminder: [`خطتك ${plan} تتجدد في ${date}`, `تتجدد خطتك ${plan} تلقائياً في ${date}${days ? ` (بعد ${days} يوم)` : ""}${money ? `، المبلغ ${money}` : ""}. يمكنك إيقاف التجديد التلقائي من الخطة والفوترة.`],
    renewal_off_reminder: [`خطتك ${plan} تنتهي في ${date}`, `التجديد التلقائي متوقف. في ${date} تنتقل مؤسستك إلى الخطة المجانية Lite. بياناتك محفوظة. فعّل التجديد التلقائي من الخطة والفوترة للبقاء على ${plan}.`],
    payment_method_missing: [`أضف وسيلة دفع قبل ${date}`, `تتجدد خطتك ${plan} في ${date} ولا توجد وسيلة دفع محفوظة. أضف واحدة من الخطة والفوترة وإلا تنتقل الخطة إلى Lite.`],
    payment_failed: [`تعذّر تحصيل دفعة خطتك ${plan}`, `لم نتمكن من تحصيل الاشتراك وسنعيد المحاولة. إذا بقي غير مدفوع تنتقل مؤسستك إلى الخطة المجانية Lite (بياناتك محفوظة). ادفع من الخطة والفوترة.`],
    downgrade_warning: [`خطتك تنتقل إلى Lite غداً`, `الدفعة ما زالت متأخرة. غداً تنتقل مؤسستك إلى الخطة المجانية Lite. بياناتك محفوظة ويمكنك الترقية في أي وقت.`],
    downgraded_to_lite: [`مؤسستك الآن على الخطة المجانية Lite`, `انتقل اشتراكك إلى Lite ولم يُحذف أي شيء. تبقى الوحدات غير المشمولة قابلة للقراءة لمدة ${v(vars, "readOnlyGraceDays", "عدة")} يوم. قم بالترقية من الخطة والفوترة لاستعادتها.`],
    auto_renew_off: [`تم إيقاف التجديد التلقائي`, `تبقى خطتك ${plan} فعّالة حتى ${date} ثم تنتقل إلى الخطة المجانية Lite. بياناتك محفوظة.`],
    auto_renew_on: [`تم تفعيل التجديد التلقائي`, `تتجدد خطتك ${plan} تلقائياً في ${date}.`],
    reactivated: [`أهلاً بعودتك إلى ${plan}`, `مؤسستك على خطة ${plan} مرة أخرى.`],
  };
  const table = locale === "ar" ? ar : en;
  const [subject, text] = table[kind] ?? table.renewal_reminder!;
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
  "subscription_notice",
  "kiorly_invoice_statement",
  "password_reset",
  "security_alert",
  "weekly_report",
];
