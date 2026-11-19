import type { Profession } from "@prisma/client";
import { scopeAllows, type ProfessionPack } from "./profession-pack";
import type { ScopeCapability } from "./scope-capabilities";

/**
 * PRSOP04 — AI scribe and assistant prompts carry the clinician's profession; drafts never suggest actions outside
 * its scope. The clause is derived from the market pack's matrix (not hard-coded), so a pack change changes the prompt.
 */

const DENIED_PHRASES: Partial<Record<ScopeCapability, { en: string; ar: string }>> = {
  "rx.prescribe": { en: "prescribing or suggesting drugs, doses or prescriptions", ar: "وصف أو اقتراح أدوية أو جرعات أو وصفات طبية" },
  "orders.lab_radiology": { en: "ordering laboratory or radiology tests", ar: "طلب تحاليل أو أشعة" },
  "mar.administer": { en: "recording medication administration", ar: "تسجيل إعطاء الأدوية" },
  "home_visits.perform": { en: "performing home visits", ar: "إجراء زيارات منزلية" },
  "encounter.sign": { en: "signing or finalising clinical records", ar: "اعتماد أو إنهاء السجلات السريرية" },
};

export function professionPromptClause(pack: ProfessionPack, profession: Profession | null, locale: "en" | "ar"): string {
  if (!profession) return "";
  const v = pack.verification[profession];
  const label = locale === "ar" ? v.labelAr : v.labelEn;
  const denied = (Object.keys(DENIED_PHRASES) as ScopeCapability[])
    .filter((c) => !scopeAllows(pack, profession, c))
    .map((c) => DENIED_PHRASES[c]![locale]);
  if (locale === "ar") {
    return `\n\nالمستخدم: ${label} (المهنة: ${profession}). التزم بنطاق ممارسة هذه المهنة ولا تقترح إجراءات خارجه.${denied.length ? ` ممنوع: ${denied.join("؛ ")}.` : ""}`;
  }
  return `\n\nThe user is a ${label} (profession: ${profession}). Stay inside this profession's scope of practice and never suggest actions outside it.${denied.length ? ` Out of scope: ${denied.join("; ")}.` : ""}`;
}

type Draft = { plan: string; medications: { drugName: string; dosage: string; instructions?: string }[]; localeNote: string };

const RX_CLAUSE = /\b(start|prescrib\w*|PPI|antibiotic\w*|mg\b|dose)\b/i;
const ORDER_CLAUSE = /\b(labs?|LFTs?|CBC|ultrasound|imaging|x-?ray|MRI|CT|radiolog\w*|blood tests?)\b/i;

/** Remove from a scribe draft anything the profession may not do. Pure; the clinician still reviews every field. */
export function constrainDraftToScope<T extends Draft>(draft: T, pack: ProfessionPack, profession: Profession | null): T {
  if (!profession) return draft;
  const canRx = scopeAllows(pack, profession, "rx.prescribe");
  const canOrder = scopeAllows(pack, profession, "orders.lab_radiology");
  if (canRx && canOrder) return draft;
  const clauses = draft.plan.split(/;\s*/).filter((c) => !(!canRx && RX_CLAUSE.test(c)) && !(!canOrder && ORDER_CLAUSE.test(c)));
  const removed = clauses.length !== draft.plan.split(/;\s*/).length || (!canRx && draft.medications.length > 0);
  return {
    ...draft,
    plan: clauses.join("; ").trim() || "Plan pending clinician review.",
    medications: canRx ? draft.medications : [],
    localeNote: removed ? `${draft.localeNote} Suggestions outside the ${profession} scope of practice were removed.` : draft.localeNote,
  };
}
