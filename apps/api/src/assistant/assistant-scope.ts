/** Map user phrasing to nav tab keys required to discuss a topic. */
export function requiredNavKeysForMessage(message: string): string[] {
  const m = message.toLowerCase();
  const keys = new Set<string>();

  if (/trn|vat|tax registration|ضريبة|رقم ضريبي|قيمة مضافة/.test(m)) keys.add("admin");
  if (/organization settings|إعدادات المؤسسة|tenant setting/.test(m)) keys.add("admin");
  if (/integrat|webhook|api client|تكامل/.test(m)) keys.add("admin");
  if (/governance|audit log|حوكمة|تدقيق/.test(m)) keys.add("admin");
  if (/clinic admin|user role|nav tab|صلاحيات|مستخدمين|عيادات وفروع|clinics & branches/.test(m)) {
    keys.add("admin");
    keys.add("clinics");
  }
  if (/\bhr\b|employee|payroll|leave|attendance|موظف|موارد بشرية|إجازة|حضور/.test(m)) keys.add("hr");
  if (/expense|مصروف|مصروفات/.test(m)) keys.add("expenses");
  if (/revenue|إيراد|إيرادات/.test(m) && !/doctor|طبيب|my revenue|إيراداتي/.test(m)) keys.add("revenue");
  if (/doctor revenue|إيراداتي|my revenue/.test(m)) keys.add("doctor_revenue");
  if (/report|analytics|p&l|profit|تقرير|تقارير/.test(m)) keys.add("reports");
  if (/support ticket|customer support|تذكرة|دعم العملاء/.test(m)) keys.add("customer_support");
  if (/platform organiz|platform user|platform clinic|منصة/.test(m)) {
    keys.add("platform_organizations");
    keys.add("platform_users");
    keys.add("platform_clinics");
  }
  if (/dashboard|لوحة/.test(m)) keys.add("dashboard");
  if (/patient|mrn|مريض|مرضى/.test(m)) keys.add("patients");
  if (/encounter|visit|زيارة|زيارات/.test(m)) keys.add("encounters");
  if (/appointment|موعد|مواعيد|حجز/.test(m)) keys.add("appointments");
  if (/operation|surgery|procedure|عمليات|جراحة/.test(m)) keys.add("operations");
  if (/invoice|فاتورة|فواتير/.test(m)) {
    keys.add("encounters");
    keys.add("operations");
  }

  return [...keys];
}

export function messageAllowedForNav(message: string, navKeys: string[]): boolean {
  const required = requiredNavKeysForMessage(message);
  if (!required.length) return true;
  return required.some((k) => navKeys.includes(k));
}

export function outOfScopeReply(locale: "en" | "ar", navKeys: string[]): string {
  const areas = navKeys.filter((k) => k !== "profile").join(", ") || "profile";
  return locale === "ar"
    ? `لا يمكنني الإجابة عن هذا الموضوع لأنه خارج صلاحياتك الحالية. يمكنني الإجابة عن الأسئلة والإجراءات ضمن: ${areas}.`
    : `I can't answer that topic because it's outside your current permissions. I can answer questions and how-to steps within: ${areas}.`;
}
