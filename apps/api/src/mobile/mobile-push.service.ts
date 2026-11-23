import { Injectable, Logger } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PushSender, pushConfigFromEnv, pushProblems } from "../common/vendors/push";
import { providerMode } from "../common/provider-mode";

export type MobileKind = "GENERAL" | "SAFETY" | "CLINICAL" | "OPS";
interface Template { kind: MobileKind; title: string; titleAr: string; body: string; bodyAr: string }

/** Bilingual templates. NO raw clinical values (ids and counts only). TODO_NEEDS_HUMAN: final wording with the CMO. */
export const MOBILE_TEMPLATES: Record<string, Template> = {
  HOME_SAFETY_ALERT: { kind: "SAFETY", title: "Home-visit safety alert", titleAr: "تنبيه سلامة لزيارة منزلية", body: "A safety alert was raised on a home visit. Check in with the clinician now.", bodyAr: "تم رفع تنبيه سلامة على زيارة منزلية. تواصل مع الممارس الآن." },
  CRITICAL_VITALS: { kind: "SAFETY", title: "Critical vital signs recorded", titleAr: "علامات حيوية حرجة", body: "A critical observation needs an escalation entry.", bodyAr: "ملاحظة حرجة تحتاج إلى تسجيل إجراء التصعيد." },
  LAB_RESULT_READY: { kind: "CLINICAL", title: "Lab results ready", titleAr: "نتائج التحاليل جاهزة", body: "Results for one of your patients are ready for review.", bodyAr: "نتائج أحد مرضاك جاهزة للمراجعة." },
  PATIENT_CHECKED_IN: { kind: "CLINICAL", title: "Patient checked in", titleAr: "وصل المريض", body: "Your next patient has checked in and is waiting.", bodyAr: "وصل مريضك التالي وهو في الانتظار." },
  UPGRADE_REQUEST: { kind: "OPS", title: "Staff asked to upgrade Kiorly", titleAr: "طلب موظف ترقية كيورلي", body: "A team member asked for the Kiorly staff app (Pro plan). Review plans in Billing.", bodyAr: "طلب أحد أعضاء الفريق تطبيق كيورلي للموظفين (باقة Pro). راجع الباقات من الفوترة." },
  TEST: { kind: "GENERAL", title: "Kiorly test notification", titleAr: "إشعار تجريبي من كيورلي", body: "Push is working on this device.", bodyAr: "الإشعارات تعمل على هذا الجهاز." },
};

const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_m, k: string) => String(p[k] ?? ""));

/**
 * Kiorly push sender. MOBILE_PUSH_MODE=mock (default): stores the message (= the in-app inbox) and marks it DELIVERED. real: FCM HTTP v1 / Expo push (PUSH_* env, see Docs/KIORLY_NEEDS_HUMAN.md "Provider go-live").
 */
@Injectable()
export class MobilePushService {
  private readonly log = new Logger(MobilePushService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Android channel id (created by the app, see kiorly src/lib/notificationChannels.ts). */
  static channelFor(kind: MobileKind): string { return kind === "SAFETY" ? "safety" : kind === "CLINICAL" ? "clinical" : kind === "OPS" ? "ops" : "default"; }

  /** Test seam for the push providers (FCM v1 / Expo). */
  static fetchImpl?: typeof fetch;

  /** MOBILE_PUSH_MODE (legacy) or KIORLY_PROVIDER_MODE_PUSH / PUSH_MODE = real. */
  static mode(): "mock" | "real" {
    return process.env.MOBILE_PUSH_MODE === "real" ? "real" : process.env.MOBILE_PUSH_MODE === "mock" ? "mock" : providerMode("push");
  }

  async send(input: { tenantId: string; userId: string; templateId: string; params?: Record<string, string | number>; data?: Record<string, unknown> }) {
    const tpl = MOBILE_TEMPLATES[input.templateId];
    if (!tpl) throw new Error(`unknown mobile push template ${input.templateId}`);
    const p = input.params ?? {};
    const real = MobilePushService.mode() === "real";
    if (real && pushProblems(process.env).length) throw new Error("push credentials are not set (PUSH_FCM_SERVICE_ACCOUNT_JSON and/or PUSH_EXPO_ENABLED / PUSH_EXPO_ACCESS_TOKEN)");
    // The inbox row is always written (it is the in-app inbox); real mode additionally hands it to FCM v1 / the Expo push service for the user's devices.
    const row = await this.prisma.mobilePush.create({
      data: { tenantId: input.tenantId, userId: input.userId, kind: tpl.kind, templateId: input.templateId, title: fill(tpl.title, p), titleAr: fill(tpl.titleAr, p), body: fill(tpl.body, p), bodyAr: fill(tpl.bodyAr, p), data: (input.data ?? {}) as never, status: real ? "SENT" : "DELIVERED", provider: real ? "push" : "mock", deliveredAt: real ? null : new Date() },
    });
    if (real) {
      const devices = await this.prisma.mobileDevice.findMany({ where: { tenantId: input.tenantId, userId: input.userId, status: "ACTIVE", pushToken: { not: null } }, select: { pushToken: true } });
      const tokens = devices.map((d) => d.pushToken!).filter((t) => t && !t.startsWith("mock-"));
      const sender = new PushSender(pushConfigFromEnv(process.env), MobilePushService.fetchImpl ?? fetch);
      let ok = 0; const dead: string[] = [];
      for (const token of tokens) {
        const r = await sender.send({ token, title: row.title, body: row.body, data: { ...(input.data ?? {}), pushId: row.id }, channelId: MobilePushService.channelFor(tpl.kind) });
        if (r.ok) ok++; else if (r.invalidToken) dead.push(token);
      }
      if (dead.length) await this.prisma.mobileDevice.updateMany({ where: { tenantId: input.tenantId, pushToken: { in: dead } }, data: { pushToken: null, pushProvider: null } }); // uninstalled: stop pushing
      if (tokens.length && !ok) { await this.prisma.mobilePush.update({ where: { id: row.id }, data: { status: "FAILED" } }); this.log.warn(`push provider rejected every device for inbox ${row.id}`); }
    }
    return row;
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
