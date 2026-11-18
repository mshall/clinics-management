import type { LegalDocumentId } from "./legal-catalog";
import { LEGAL_CATALOG } from "./legal-catalog";

type LegalBody = { bodyEn: string; bodyAr: string };

const BODIES: Record<LegalDocumentId, LegalBody> = {
  terms_of_service: {
    bodyEn:
      "By using Kiorly you agree to operate your clinic lawfully, keep credentials secure, and use the platform only for licensed healthcare operations. Kiorly provides software; clinical decisions remain with licensed professionals.",
    bodyAr:
      "باستخدامك كيورلي فإنك توافق على تشغيل عيادتك وفق القانون، وحماية بيانات الدخول، واستخدام المنصة للعمل الطبي المرخّص فقط. كيورلي تقدّم برمجيات؛ القرارات السريرية تبقى لدى المختصين المرخّصين.",
  },
  subscription_terms: {
    bodyEn:
      "Subscriptions renew automatically each billing period unless cancelled before renewal. Free trials convert to paid unless cancelled before trial end. Failed payments enter dunning: reminders, grace period, then suspension. Seat and plan changes prorate per your market price list.",
    bodyAr:
      "يتجدد الاشتراك تلقائياً ما لم يُلغَ قبل التجديد. التجربة المجانية تتحول إلى مدفوع ما لم يُلغَ قبل انتهائها. عند فشل الدفع: تذكير، مهلة سماح، ثم تعليق. تغييرات المقاعد والخطة تُحسب وفق قائمة أسعار السوق.",
  },
  kiorex_marketplace_fees: {
    bodyEn:
      "New patients acquired through Kiorex marketplace may incur a marketplace fee per your plan. Fees apply on first completed visit attributed to Kiorex. Disputes must be raised within 30 days with booking reference and patient MRN.",
    bodyAr:
      "قد تُفرض رسوم سوق على المرضى الجدد عبر كيوركس حسب خطتك. تُطبَّق الرسوم عند أول زيارة مكتملة منسوبة لكيوركس. النزاعات خلال 30 يوماً مع مرجع الحجز وMRN.",
  },
  dpa: {
    bodyEn:
      "Kiorly processes clinic and patient data as processor on your instructions. You are controller for patient PHI. Processing locations follow your market data cell. Subprocessors are listed in product documentation. Security measures include encryption in transit, RBAC, and audit logs.",
    bodyAr:
      "تعالج كيورلي بيانات العيادة والمرضى بمعالج وفق تعليماتكم. أنتم المتحكم في بيانات المرضى الصحية. مواقع المعالجة تتبع خلية بيانات السوق. المعالجون الفرعيون مذكورون في وثائق المنتج. الإجراءات تشمل التشفير أثناء النقل وصلاحيات الوصول وسجلات التدقيق.",
  },
  patient_privacy_notice: {
    bodyEn:
      "We process your personal and health data to provide care, scheduling, billing, and legally required fiscal receipts. Categories include identity, contact, clinical records, and payment details. For receipts above EGP 150,000 your name may be sent to the Egyptian Tax Authority as buyer details. Data may be processed on secure servers outside Egypt (Frankfurt) under PDPC cross-border rules. Retention follows clinic policy and law. You may request access, correction, or restriction via the clinic data protection officer (DPO). Breaches are reported to PDPC within 72 hours and to affected persons within 3 days where required.",
    bodyAr:
      "نعالج بياناتك الشخصية والصحية لتقديم الرعاية والمواعيد والفوترة والإيصالات الضريبية المطلوبة قانوناً. تشمل البيانات الهوية وبيانات الاتصال والسجل السريري والمدفوعات. للمدفوعات فوق 150,000 جنيه قد يُرسل اسمك إلى مصلحة الضرائب كبيانات مشتري. قد تُعالج البيانات على خوادم آمنة خارج مصر (فرانكفورت) وفق قواعد النقل عبر الحدود لـ PDPC. تُحفظ البيانات حسب سياسة العيادة والقانون. يمكنك طلب الاطلاع أو التصحيح أو تقييد المعالجة عبر مسؤول حماية البيانات (DPO) في العيادة. في حال الخرقات نُبلّغ PDPC خلال 72 ساعة والمتضررين خلال 3 أيام حيث يقتضي القانون.",
  },
  acceptable_use: {
    bodyEn:
      "No abuse of messaging, scraping, reverse engineering, or sharing accounts. No unlawful content. Kiorly may suspend tenants that risk patients, staff, or platform integrity.",
    bodyAr:
      "يُحظر إساءة استخدام الرسائل أو الاستخراج الآلي أو الهندسة العكسية أو مشاركة الحسابات أو المحتوى غير القانوني. قد تعلّق كيورلي المنظمات التي تعرّض المرضى أو المنصة للخطر.",
  },
  refund_policy: {
    bodyEn:
      "SaaS fees are non-refundable except where required by local law or written enterprise agreement. Downgrades take effect at next renewal. Chargebacks without prior support contact may lead to suspension.",
    bodyAr:
      "رسوم الاشتراك غير قابلة للاسترداد إلا حيث يفرض القانون المحلي أو عقد مؤسسي كتابي. التخفيضات تسري من التجديد التالي. استردادات بنكية دون تذكرة دعم قد تؤدي إلى التعليق.",
  },
};

export function legalDocumentPayload(id: LegalDocumentId) {
  const meta = LEGAL_CATALOG[id];
  const body = BODIES[id];
  return {
    document: id,
    version: meta.version,
    titleEn: meta.titleEn,
    titleAr: meta.titleAr,
    bodyEn: body.bodyEn,
    bodyAr: body.bodyAr,
    effectiveAt: meta.version,
  };
}