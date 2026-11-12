import type { IntegrationFailureResolution } from "./integration-failure-hints";

type Locale = "en" | "ar";

const AR: Partial<Record<string, IntegrationFailureResolution>> = {
  auth: {
    summary: "فشل مصادقة التكامل.",
    likelyCause: "رمز Bearer غير صالح أو تم تدويره، أو العميل معطّل.",
    actions: [
      "أعد إنشاء رمز Bearer من إدارة → عملاء واجهة التكامل.",
      "تأكد من صيغة Authorization: Bearer kio_live.<clientKey>.<secret>.",
      "رموز JWT للموظفين مرفوضة على مسارات /integrations/*.",
    ],
    severity: "critical",
  },
  forbidden: {
    summary: "العميل لا يملك صلاحية لهذا الإجراء.",
    actions: [
      "أضف نطاقات APPOINTMENTS_* أو OPERATIONS_* على عميل التكامل.",
      "إذا كنت تستخدم قيود العيادات، أضف معرف العيادة إلى القائمة المسموحة.",
    ],
    severity: "warning",
  },
  webhook: {
    summary: "فشل تسليم الويب هوك الصادر.",
    actions: [
      "تحقق من أن عنوان الويب هوك يمكن الوصول إليه من خادم الـ API.",
      "تحقق من توقيع X-Kiorly-Signature باستخدام سر التوقيع.",
    ],
    severity: "warning",
  },
  notFound: {
    summary: "المورد المشار إليه غير موجود.",
    actions: ["تأكد من معرفات العيادة والطبيب والمريض ضمن المؤسسة."],
    severity: "warning",
  },
  validation: {
    summary: "فشل التحقق من الطلب.",
    actions: ["قارن الحقول مع وثائق OpenAPI لمسارات /integrations."],
    severity: "info",
  },
  default: {
    summary: "فشل طلب التكامل الخارجي.",
    actions: [
      "تأكد أن عميل التكامل نشط وأن النطاقات تشمل هذه الواجهة.",
      "تحقق من قائمة العيادات المسموحة على العميل.",
    ],
    severity: "warning",
  },
};

export function localizeIntegrationFailureResolution(
  locale: string | undefined,
  key: "auth" | "forbidden" | "webhook" | "notFound" | "validation" | "default",
  fallback: IntegrationFailureResolution,
): IntegrationFailureResolution {
  const loc: Locale = locale?.toLowerCase().startsWith("ar") ? "ar" : "en";
  if (loc === "en") return fallback;
  const translated = AR[key];
  if (!translated) return fallback;
  return {
    summary: translated.summary ?? fallback.summary,
    likelyCause: translated.likelyCause ?? fallback.likelyCause,
    actions: translated.actions?.length ? translated.actions : fallback.actions,
    severity: translated.severity ?? fallback.severity,
  };
}
