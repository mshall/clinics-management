import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { TenantRoleNavTabsService } from "../user-nav-tabs/tenant-role-nav-tabs.service";
import { assertAssistantAccess, type AssistantRoleSlug } from "./assistant-access";
import { resolveAssistantNavKeys } from "./assistant-effective-nav";
import { NAV_GUIDANCE, TOPIC_GUIDANCE } from "./assistant-knowledge";
import { AssistantLiveDataService } from "./assistant-live-data.service";
import { messageAsksForLiveMetric } from "./assistant-intent";
import { messageAsksForPatientLookup } from "./assistant-patient-search";
import { tryPlaybookReply } from "./assistant-playbook";
import { composeCapabilityOverview, findQaAnswer, isSmallTalkOrMeta } from "./assistant-qa";
import { buildMatureSystemPrompt } from "./assistant-system-prompt";
import { roleAssistantContent } from "./assistant-role-content";
import type { AssistantChatActionDto } from "./dto/assistant-chat.dto";
import { messageAllowedForNav, outOfScopeReply, requiredNavKeysForMessage } from "./assistant-scope";
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
    private readonly liveData: AssistantLiveDataService,
    private readonly config: ConfigService,
  ) {}

  private async allowedNavKeys(user: JwtUser): Promise<string[]> {
    return resolveAssistantNavKeys(this.prisma, this.tenantRoleNav, user);
  }

  async getContext(user: JwtUser, locale?: string): Promise<AssistantContextDto> {
    const persona = assertAssistantAccess(user);
    const lang = locale === "ar" ? "ar" : "en";
    const allowedNavKeys = await this.allowedNavKeys(user);
    const { title, greeting, suggestedPrompts } = roleAssistantContent(user.role, lang, allowedNavKeys);
    return {
      persona,
      title,
      greeting,
      suggestedPrompts,
      allowedNavKeys,
    };
  }

  private navKeyAllowed(navKeys: string[], key: string): boolean {
    return navKeys.includes(key);
  }

  private ruleBasedReply(message: string, locale: "en" | "ar", navKeys: string[]): string {
    if (isSmallTalkOrMeta(message)) {
      return composeCapabilityOverview(navKeys, locale);
    }

    if (!messageAllowedForNav(message, navKeys)) {
      return outOfScopeReply(locale, navKeys);
    }

    const qa = findQaAnswer(message, navKeys, locale);
    if (qa) return qa;

    const m = message.toLowerCase();
    const pick = (key: keyof typeof TOPIC_GUIDANCE) => TOPIC_GUIDANCE[key][locale];

    if (/trn|vat|tax|ضريبة|رقم ضريبي/.test(m)) {
      if (!this.navKeyAllowed(navKeys, "admin")) return outOfScopeReply(locale, navKeys);
      return pick("trn_vat");
    }
    if (/invoice|فاتورة|فواتير/.test(m)) {
      if (!this.navKeyAllowed(navKeys, "encounters") && !this.navKeyAllowed(navKeys, "operations")) {
        return outOfScopeReply(locale, navKeys);
      }
      return pick("invoice");
    }
    if (/scribe|transcri|ambient|ملاحظات|تدوين|مساعد سريري/.test(m)) {
      if (!this.navKeyAllowed(navKeys, "encounters")) return outOfScopeReply(locale, navKeys);
      return pick("ai_scribe");
    }
    if (/language|لغة|english|arabic|عربية/.test(m)) return pick("language");

    for (const key of navKeys) {
      const g = NAV_GUIDANCE[key];
      if (!g) continue;
      if (m.includes(key.replace(/_/g, " ")) || m.includes(key)) {
        return g[locale];
      }
    }

    const keywordHits: { pattern: RegExp; nav: string }[] = [
      { pattern: /clinic|عياد|branch|فرع/, nav: "clinics" },
      { pattern: /employee|hr|موظف|موارد بشرية/, nav: "hr" },
      { pattern: /appointment|موعد|حجز/, nav: "appointments" },
      { pattern: /encounter|visit|زيارة/, nav: "encounters" },
      { pattern: /integrat|webhook|تكامل/, nav: "admin" },
      { pattern: /expense|مصروف/, nav: "expenses" },
      { pattern: /revenue|إيراد/, nav: "revenue" },
      { pattern: /report|تقرير/, nav: "reports" },
      { pattern: /support|تذكرة|دعم/, nav: "customer_support" },
      { pattern: /platform/, nav: "platform_organizations" },
    ];

    for (const hit of keywordHits) {
      if (hit.pattern.test(m)) {
        if (messageAsksForLiveMetric(message) || messageAsksForPatientLookup(message)) break;
        if (this.navKeyAllowed(navKeys, hit.nav)) {
          const g = NAV_GUIDANCE[hit.nav];
          if (g) return g[locale];
        }
        return outOfScopeReply(locale, navKeys);
      }
    }

    return composeCapabilityOverview(navKeys, locale);
  }


  private async llmReply(system: string, message: string, locale: "en" | "ar"): Promise<string | null> {
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
          temperature: 0.25,
          max_tokens: 1000,
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

    if (isSmallTalkOrMeta(message)) {
      return {
        reply: composeCapabilityOverview(navKeys, locale),
        persona,
        suggestedPrompts: roleAssistantContent(user.role, locale, navKeys).suggestedPrompts,
      };
    }

    if (!messageAllowedForNav(message, navKeys)) {
      return {
        reply: outOfScopeReply(locale, navKeys),
        persona,
        suggestedPrompts: roleAssistantContent(user.role, locale, navKeys).suggestedPrompts,
      };
    }

    const snapshot = await this.liveData.buildSnapshot(user, navKeys, message);
    const direct = this.liveData.tryDirectDataReply(snapshot, message, locale);
    if (direct?.trim()) {
      return this.replyResponse(user, persona, locale, navKeys, direct);
    }

    const patientLookup = await this.liveData.tryPatientLookupReply(user, navKeys, message, locale);
    if (patientLookup) {
      return this.replyResponse(
        user,
        persona,
        locale,
        navKeys,
        patientLookup.reply,
        patientLookup.actions.length ? patientLookup.actions : undefined,
      );
    }

    const playbook = tryPlaybookReply(message, navKeys, locale);
    if (playbook) {
      return this.replyResponse(user, persona, locale, navKeys, playbook.reply, playbook.actions);
    }

    const qaEarly = findQaAnswer(message, navKeys, locale);
    if (qaEarly && !this.config.get<string>("OPENAI_API_KEY")?.trim()) {
      return this.replyResponse(user, persona, locale, navKeys, qaEarly);
    }

    const liveJson = this.liveData.snapshotForPrompt(snapshot);
    const system = buildMatureSystemPrompt(persona, navKeys, locale, liveJson);
    const llm = await this.llmReply(system, message, locale);
    let reply = llm ?? this.ruleBasedReply(message, locale, navKeys);
    let actions: AssistantChatActionDto[] | undefined;
    if (!llm?.trim() && snapshot.financialSummary && /revenue|expense|إيراد|مصروف/i.test(message)) {
      reply = this.liveData.formatFinancialReply(snapshot, locale);
    }

    const required = requiredNavKeysForMessage(message);
    if (required.length && !required.some((k) => navKeys.includes(k))) {
      reply = outOfScopeReply(locale, navKeys);
      actions = undefined;
    }

    if (!actions?.length) {
      const playbookFallback = tryPlaybookReply(message, navKeys, locale);
      if (playbookFallback?.actions?.length && /how|steps|open|go to|كيف|افتح/i.test(message)) {
        actions = playbookFallback.actions;
      }
    }

    return this.replyResponse(user, persona, locale, navKeys, reply, actions);
  }

  private replyResponse(
    user: JwtUser,
    persona: AssistantRoleSlug,
    locale: "en" | "ar",
    navKeys: string[],
    reply: string,
    actions?: AssistantChatActionDto[],
  ): AssistantChatResponseDto {
    return {
      reply,
      persona,
      suggestedPrompts: roleAssistantContent(user.role, locale, navKeys).suggestedPrompts,
      actions: actions?.length ? actions : undefined,
    };
  }
}
