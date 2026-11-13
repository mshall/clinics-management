export function messageAsksForClinicList(message: string): boolean {
  const m = message.toLowerCase();
  return (
    /(list|show|enumerate|what are|which|name|display).*(clinic|branch|location|عياد|فروع)/i.test(message) ||
    /(clinic|branch).*(list|names|in (this|the|my) org|in the organization)/i.test(m) ||
    /(قائمة|ما هي|اذكر).*(العيادات|الفروع)/u.test(message)
  );
}

export function messageNeedsClinicContext(message: string): boolean {
  return messageAsksForClinicList(message) || /\bclinic|branch|عياد|فرع\b/i.test(message);
}

export function messageAsksForPatientCount(message: string): boolean {
  return /how many patient|patient count|number of patient|كم مريض|عدد المرضى/i.test(message);
}

export function messageAsksForOrgUsers(message: string): boolean {
  return /how many user|user count|staff count|organi[sz]ation user|كم مستخدم|عدد المستخدمين/i.test(message);
}

export function messageAsksForRevenue(message: string): boolean {
  return (
    /revenue|income|earnings|takings|sales|turnover|إيراد|إيرادات|دخل|دخول/i.test(message) &&
    !/expense|مصروف/i.test(message)
  );
}

export function messageAsksForExpenses(message: string): boolean {
  return /expense|expenses|spend|costs|مصروف|مصروفات|تكلفة/i.test(message);
}

export function messageAsksForPersonalRevenue(message: string): boolean {
  return /my revenue|doctor revenue|إيراداتي|دخلي/i.test(message);
}
