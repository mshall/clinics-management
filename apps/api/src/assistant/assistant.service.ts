import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { TenantRoleNavTabsService } from "../user-nav-tabs/tenant-role-nav-tabs.service";
import { assertAssistantAccess, type AssistantRoleSlug } from "./assistant-access";
import { resolveAssistantNavKeys } from "./assistant-effective-nav";
import { NAV_GUIDANCE, TOPIC_GUIDANCE } from "./assistant-knowledge";
import { AssistantLiveDataService } from "./assistant-live-data.service";
import { composeCapabilityOverview, findQaAnswer, isSmallTalkOrMeta } from "./assistant-qa";
import { roleAssistantContent, assistantSystemPersonaLabel } from "./assistant-role-content";
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
        if (this.navKeyAllowed(navKeys, hit.nav)) {
          const g = NAV_GUIDANCE[hit.nav];
          if (g) return g[locale];
        }
        return outOfScopeReply(locale, navKeys);
      }
    }

    return composeCapabilityOverview(navKeys, locale);
  }

  private buildSystemPrompt(
    persona: AssistantRoleSlug,
    navKeys: string[],
    locale: "en" | "ar",
    liveJson: string,
  ): string {
    const label = assistantSystemPersonaLabel(persona, locale);
    const navSummary = navKeys
      .map((k) => NAV_GUIDANCE[k]?.[locale])
      .filter(Boolean)
      .join("\n");
    return [
      `You are ${label} for Kiorly clinic software.`,
      "Answer conceptual questions and how-to steps using ONLY the live organization snapshot and nav guidance below.",
      "For lists (clinics, counts), quote the snapshot exactly; never invent clinics, patients, or users.",
      "You must NOT discuss modules or actions outside allowedNavKeys.",
      "If the user asks to change data, describe the steps in the UI — you cannot mutate the database yourself.",
      `Allowed nav keys: ${navKeys.join(", ")}`,
      "Live organization snapshot (JSON):",
      liveJson,
      "Nav guidance:",
      navSummary,
    ].join("\n");
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
          temperature: 0.35,
          max_tokens: 800,
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
    if (direct) {
      return {
        reply: direct,
        persona,
        suggestedPrompts: roleAssistantContent(user.role, locale, navKeys).suggestedPrompts,
      };
    }

    const liveJson = this.liveData.snapshotForPrompt(snapshot);
    const system = this.buildSystemPrompt(persona, navKeys, locale, liveJson);
    const llm = await this.llmReply(system, message, locale);
    let reply =
      llm ??
      (snapshot.clinics?.length && /clinic|عياد/i.test(message)
        ? this.liveData.formatClinicListReply(snapshot.clinics, locale, snapshot.organization?.name)
        : this.ruleBasedReply(message, locale, navKeys));

    const required = requiredNavKeysForMessage(message);
    if (required.length && !required.some((k) => navKeys.includes(k))) {
      reply = outOfScopeReply(locale, navKeys);
    }

    return {
      reply,
      persona,
      suggestedPrompts: roleAssistantContent(user.role, locale, navKeys).suggestedPrompts,
    };
  }
}
