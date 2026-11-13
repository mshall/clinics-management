import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { TenantRoleNavTabsService } from "../user-nav-tabs/tenant-role-nav-tabs.service";
import {
  defaultNavTabsForRole,
  effectiveRoleNavTabs,
  parseStoredNavTabKeys,
  sanitizeNavTabKeysForRole,
  sanitizeUserNavTabGrant,
} from "../user-nav-tabs/nav-tab-keys";
import { assertAssistantAccess, type AssistantPersona } from "./assistant-access";
import { NAV_GUIDANCE, TOPIC_GUIDANCE } from "./assistant-knowledge";
import type { AssistantChatResponseDto, AssistantContextDto } from "./dto/assistant-chat.dto";

function pickLocale(locale: string | undefined, message: string): "en" | "ar" {
  if (locale === "ar" || locale === "en") return locale;
  return /[\u0600-\u06FF]/.test(message) ? "ar" : "en";
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantRoleNav: TenantRoleNavTabsService,
    private readonly config: ConfigService,
  ) {}

  private async allowedNavKeys(user: JwtUser): Promise<string[]> {
    const tenantId = user.tenantId!;
    const [userGrant, roleGrantRaw] = await Promise.all([
      this.prisma.userNavTabGrant.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.userId } },
      }),
      this.tenantRoleNav.roleNavTabKeysForTenantUser(tenantId, user.role),
    ]);
    const roleBase = effectiveRoleNavTabs(user.role, roleGrantRaw);
    const parsedUserGrant = userGrant ? parseStoredNavTabKeys(userGrant.tabKeys) : null;
    const userKeys = parsedUserGrant?.length
      ? sanitizeUserNavTabGrant(user.role, parsedUserGrant, {
          allowOrganizationTabs: user.role === UserRole.GROUP_ADMIN,
          roleBase,
        })
      : null;
    if (userKeys?.length) return userKeys;
    if (user.role === UserRole.GROUP_ADMIN || user.role === UserRole.GROUP_SUPERVISOR) {
      return roleBase.length ? roleBase : defaultNavTabsForRole(user.role);
    }
    return sanitizeNavTabKeysForRole(user.role, roleBase, roleBase);
  }

  private suggestedPrompts(persona: AssistantPersona, locale: "en" | "ar"): string[] {
    if (persona === "physician") {
      return locale === "ar"
        ? [
            "كيف أبدأ زيارة جديدة؟",
            "أين أجد مواعيدي؟",
            "شرح الفواتير الضريبية للمريض",
            "مساعد سريري بالعربية والإنجليزية",
          ]
        : [
            "How do I start a new encounter?",
            "Where are my appointments?",
            "Explain tax invoices for patients",
            "Clinical scribe in Arabic and English",
          ];
    }
    return locale === "ar"
      ? [
          "ضبط TRN وضريبة القيمة المضافة للمؤسسة",
          "إضافة عيادة جديدة",
          "صلاحيات المستخدمين والتبويبات",
          "مراجعة أخطاء التكامل",
        ]
      : [
          "Set organization TRN and VAT",
          "Add a new clinic",
          "User roles and nav permissions",
          "Review integration failures",
        ];
  }

  private contextCopy(persona: AssistantPersona, locale: "en" | "ar"): { title: string; greeting: string } {
    if (persona === "physician") {
      return locale === "ar"
        ? {
            title: "مساعد الطبيب",
            greeting:
              "مرحباً — أنا مساعدك في كيورلي. أساعدك في المرضى والمواعيد والزيارات والإيرادات ضمن صلاحياتك. اسأل بالعربية أو الإنجليزية.",
          }
        : {
            title: "Physician assistant",
            greeting:
              "Hi — I'm your Kiorly copilot. I help with patients, appointments, encounters, and revenue within your permissions. Ask in English or Arabic.",
          };
    }
    return locale === "ar"
      ? {
          title: "مساعد مدير المؤسسة",
          greeting:
            "مرحباً — أنا مساعد الإدارة. أرشدك عبر العيادات والمستخدمين والإعدادات والحوكمة حسب صلاحياتك. اسأل بالعربية أو الإنجليزية.",
        }
      : {
          title: "Organization admin assistant",
          greeting:
            "Hi — I'm your organization admin assistant. I guide you through clinics, users, settings, and governance within your permissions. Ask in English or Arabic.",
        };
  }

  async getContext(user: JwtUser, locale?: string): Promise<AssistantContextDto> {
    const persona = assertAssistantAccess(user);
    const lang = locale === "ar" ? "ar" : "en";
    const { title, greeting } = this.contextCopy(persona, lang);
    return {
      persona,
      title,
      greeting,
      suggestedPrompts: this.suggestedPrompts(persona, lang),
      allowedNavKeys: await this.allowedNavKeys(user),
    };
  }

  private ruleBasedReply(
    message: string,
    locale: "en" | "ar",
    persona: AssistantPersona,
    navKeys: string[],
  ): string {
    const m = message.toLowerCase();
    const pick = (key: keyof typeof TOPIC_GUIDANCE) => TOPIC_GUIDANCE[key][locale];

    if (/trn|vat|tax|ضريبة|رقم ضريبي/.test(m)) return pick("trn_vat");
    if (/invoice|فاتورة|فواتير/.test(m)) return pick("invoice");
    if (/scribe|transcri|ambient|ملاحظات|تدوين|مساعد سريري|عربي/.test(m)) return pick("ai_scribe");
    if (/language|لغة|english|arabic|عربية/.test(m)) return pick("language");

    for (const key of navKeys) {
      const g = NAV_GUIDANCE[key];
      if (!g) continue;
      if (m.includes(key.replace(/_/g, " ")) || m.includes(key)) {
        return g[locale];
      }
    }

    if (/clinic|عياد|branch|فرع/.test(m) && navKeys.includes("admin")) {
      return NAV_GUIDANCE.admin[locale];
    }
    if (/employee|hr|موظف|موارد بشرية/.test(m) && navKeys.includes("hr")) {
      return NAV_GUIDANCE.hr[locale];
    }
    if (/appointment|موعد|حجز/.test(m) && navKeys.includes("appointments")) {
      return NAV_GUIDANCE.appointments[locale];
    }
    if (/encounter|visit|زيارة/.test(m) && navKeys.includes("encounters")) {
      return NAV_GUIDANCE.encounters[locale];
    }
    if (/integrat|webhook|تكامل/.test(m) && navKeys.includes("admin")) {
      return locale === "ar"
        ? "راجع الإدارة → الحوكمة → العمليات الفاشلة وتكاملات API."
        : "Open Admin → Governance → Failing operations and Integration clients.";
    }

    const hints = navKeys
      .map((k) => NAV_GUIDANCE[k]?.[locale])
      .filter(Boolean)
      .slice(0, 4);
    if (persona === "physician") {
      return locale === "ar"
        ? `يمكنني المساعدة في: ${hints.join(" ")} أو اسأل عن الزيارات والمواعيد والفواتير.`
        : `I can help with: ${hints.join(" ")} Or ask about encounters, appointments, and invoices.`;
    }
    return locale === "ar"
      ? `يمكنني المساعدة ضمن صلاحياتك في: ${hints.join(" ")} جرّب السؤال عن TRN أو العيادات أو المستخدمين.`
      : `I can help within your permissions on: ${hints.join(" ")} Try asking about TRN, clinics, or users.`;
  }

  private async llmReply(
    system: string,
    message: string,
    locale: "en" | "ar",
  ): Promise<string | null> {
    const apiKey = this.config.get<string>("OPENAI_API_KEY")?.trim();
    if (!apiKey) return null;
    const model = this.config.get<string>("OPENAI_MODEL")?.trim() || "gpt-4o-mini";
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 600,
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: locale === "ar" ? `رد بالعربية. ${message}` : message,
            },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      return text || null;
    } catch {
      return null;
    }
  }

  async chat(user: JwtUser, message: string, localeHint?: string): Promise<AssistantChatResponseDto> {
    const persona = assertAssistantAccess(user);
    const locale = pickLocale(localeHint, message);
    const navKeys = await this.allowedNavKeys(user);
    const navSummary = navKeys
      .map((k) => NAV_GUIDANCE[k]?.[locale])
      .filter(Boolean)
      .join("\n");
    const system =
      persona === "physician"
        ? `You are a bilingual clinical ops assistant for a physician using Kiorly clinic software. Only advise on features the user can access. Never invent data. Nav scope:\n${navSummary}`
        : `You are a bilingual organization admin assistant for Kiorly clinic management. Only advise on features the user can access. Nav scope:\n${navSummary}`;

    const llm = await this.llmReply(system, message, locale);
    const reply = llm ?? this.ruleBasedReply(message, locale, persona, navKeys);
    return {
      reply,
      persona,
      suggestedPrompts: this.suggestedPrompts(persona, locale),
    };
  }
}
