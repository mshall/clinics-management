import { Injectable, Logger } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type MobileKind = "GENERAL" | "SAFETY" | "CLINICAL" | "OPS";
interface Template { kind: MobileKind; title: string; titleAr: string; body: string; bodyAr: string }

/** Bilingual templates. NO raw clinical values (ids and counts only). TODO_NEEDS_HUMAN: final wording with the CMO. */
export const MOBILE_TEMPLATES: Record<string, Template> = {
  HOME_SAFETY_ALERT: { kind: "SAFETY", title: "Home-visit safety alert", titleAr: "تنبيه سلامة لزيارة منزلية", body: "A safety alert was raised on a home visit. Check in with the clinician now.", bodyAr: "تم رفع تنبيه سلامة على زيارة منزلية. تواصل مع الممارس الآن." },
  CRITICAL_VITALS: { kind: "SAFETY", title: "Critical vital signs recorded", titleAr: "علامات حيوية حرجة", body: "A critical observation needs an escalation entry.", bodyAr: "ملاحظة حرجة تحتاج إلى تسجيل إجراء التصعيد." },
  LAB_RESULT_READY: { kind: "CLINICAL", title: "Lab results ready", titleAr: "نتائج التحاليل جاهزة", body: "Results for one of your patients are ready for review.", bodyAr: "نتائج أحد مرضاك جاهزة للمراجعة." },
  PATIENT_CHECKED_IN: { kind: "CLINICAL", title: "Patient checked in", titleAr: "وصل المريض", body: "Your next patient has checked in and is waiting.", bodyAr: "وصل مريضك التالي وهو في الانتظار." },
  UPGRADE_REQUEST: { kind: "OPS", title: "Staff asked to upgrade Kiorly Team", titleAr: "طلب موظف ترقية Kiorly Team", body: "A team member asked for the Kiorly Team staff app (Pro plan). Review plans in Billing.", bodyAr: "طلب أحد أعضاء الفريق تطبيق Kiorly Team للموظفين (باقة Pro). راجع الباقات من الفوترة." },
  TEST: { kind: "GENERAL", title: "Kiorly Team test notification", titleAr: "إشعار تجريبي من Kiorly Team", body: "Push is working on this device.", bodyAr: "الإشعارات تعمل على هذا الجهاز." },
};

const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_m, k: string) => String(p[k] ?? ""));

/**
 * Kiorly Team push sender. MOBILE_PUSH_MODE=mock (default): stores the message (= the in-app inbox) and marks it DELIVERED. real: Expo push is wired
 * in the provider go-live pass (Docs/NEEDS_HUMAN.md).
 */
@Injectable()
export class MobilePushService {
  private readonly log = new Logger(MobilePushService.name);
  constructor(private readonly prisma: PrismaService) {}

  static mode(): "mock" | "real" {
    return process.env.MOBILE_PUSH_MODE === "real" ? "real" : "mock";
  }

  async send(input: { tenantId: string; userId: string; templateId: string; params?: Record<string, string | number>; data?: Record<string, unknown> }) {
    const tpl = MOBILE_TEMPLATES[input.templateId];
    if (!tpl) throw new Error(`unknown mobile push template ${input.templateId}`);
    if (MobilePushService.mode() === "real") throw new Error("MOBILE_PUSH_MODE=real is not wired yet (see Docs/NEEDS_HUMAN.md, Provider go-live)");
    const p = input.params ?? {};
    return this.prisma.mobilePush.create({
      data: { tenantId: input.tenantId, userId: input.userId, kind: tpl.kind, templateId: input.templateId, title: fill(tpl.title, p), titleAr: fill(tpl.titleAr, p), body: fill(tpl.body, p), bodyAr: fill(tpl.bodyAr, p), data: (input.data ?? {}) as never, status: "DELIVERED", provider: "mock", deliveredAt: new Date() },
    });
  }

  /** Informational: never throws. */
  async notifyUsers(tenantId: string, userIds: string[], templateId: string, data: Record<string, unknown> = {}): Promise<number> {
    let n = 0;
    for (const userId of new Set(userIds)) {
      try { await this.send({ tenantId, userId, templateId, data }); n++; } catch (e) { this.log.warn(`mobile push skipped: ${(e as Error).message}`); }
    }
    return n;
  }

  async notifyRoles(tenantId: string, roles: UserRole[], templateId: string, data: Record<string, unknown> = {}): Promise<number> {
    try {
      const users = await this.prisma.user.findMany({ where: { tenantId, role: { in: roles }, deletedAt: null, deactivatedAt: null }, select: { id: true } });
      return this.notifyUsers(tenantId, users.map((u) => u.id), templateId, data);
    } catch (e) {
      this.log.warn(`mobile push skipped: ${(e as Error).message}`);
      return 0;
    }
  }
}
