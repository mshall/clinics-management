import { UserRole } from "@prisma/client";
import { canAssistantQueryPersonalRevenue } from "./assistant-finance-policy";

function messageMentionsRevenue(message: string): boolean {
  return (
    /revenue|income|earnings|takings|sales|turnover|إيراد|إيرادات|دخل|دخول/i.test(message) &&
    !/expense|مصروف/i.test(message)
  );
}

/** Explicit organization / clinic-wide ledger (not the physician income view). */
export function messageAsksForOrgRevenue(message: string): boolean {
  const m = message.toLowerCase();
  return (
    /organi[sz]ation|org-wide|organisation-wide|all clinics|whole org|for the org|for this org|entire (clinic|branch)|branch revenue|clinic revenue|group revenue|across the org|per clinic|by clinic|each clinic|revenue per|breakdown.*clinic/i.test(
      m,
    ) || /إيرادات المؤسسة|إيراد المؤسسة|المؤسسة.*إيراد|إيراد.*(كل|لكل) عياد/i.test(message)
  );
}

export function messageAsksForPersonalRevenue(message: string): boolean {
  if (messageAsksForOrgRevenue(message)) return false;
  const m = message.toLowerCase();
  return (
    /my revenue|my income|my earnings|doctor revenue|إيراداتي|دخلي|أرباحي/i.test(message) ||
    /\b(my|mine)\b.*\b(revenue|income|earnings|gross|net)\b/i.test(m) ||
    /\b(how much did i|what did i) (earn|make)\b/i.test(m) ||
    /\b(show|tell)\s+me\s+(my\s+)?(revenue|income|earnings)\b/i.test(m) ||
    /\b(gross|net)\b.*\b(revenue|income)\b/i.test(m) && /\b(my|mine|i)\b/.test(m)
  );
}

/** Physicians with Doctor revenue tab default to personal attributed income unless org is explicit. */
export function resolveAssistantRevenueIsPersonal(message: string, role: UserRole, navKeys: string[]): boolean {
  if (messageAsksForOrgRevenue(message)) return false;
  if (messageAsksForPersonalRevenue(message)) return true;
  if (
    role === UserRole.PHYSICIAN &&
    canAssistantQueryPersonalRevenue(navKeys, role) &&
    messageMentionsRevenue(message)
  ) {
    return true;
  }
  return false;
}
