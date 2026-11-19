import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { TenantRoleNavTabsService } from "../user-nav-tabs/tenant-role-nav-tabs.service";
import { AiGatewayService } from "../providers/ai/ai-gateway.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
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
import { sanitizeAssistantMessageForLlm } from "./assistant-message-sanitize";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { redactionForMarket } from "../providers/ai/market-ai-redaction";
import { UsageMeterService } from "../usage/usage-meter.service";
import { UsageMetric } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { professionPromptClause } from "../scope-of-practice/profession-prompt";
import { ScopeOfPracticeService } from "../scope-of-practice/scope-of-practice.service";

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
    private readonly ai: AiGatewayService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly usage: UsageMeterService,
    @Optional() private readonly scope?: ScopeOfPracticeService,
  ) {}

  private async assistantEnabledForUser(user: JwtUser): Promise<boolean> {
    return this.featureFlags.isEnabledForUser(user.tenantId, "ai_assistant");
  }

  private async allowedNavKeys(user: JwtUser): Promise<string[]> {
    return resolveAssistantNavKeys(this.prisma, this.tenantRoleNav, user);
  }

  async getContext(user: JwtUser, locale?: string): Promise<AssistantContextDto> {
    const persona = assertAssistantAccess(user);
    const assistantEnabled = await this.assistantEnabledForUser(user);
    const lang = locale === "ar" ? "ar" : "en";
    const allowedNavKeys = await this.allowedNavKeys(user);
    if (!assistantEnabled) {
      return {
        persona,
        title: "",
        greeting: "",
        suggestedPrompts: [],
        allowedNavKeys,
        assistantEnabled: false,
      };
    }
    const { title, greeting, suggestedPrompts } = roleAssistantContent(user.role, lang, allowedNavKeys);
    return {
      persona,
      title,
      greeting,
      suggestedPrompts,
      allowedNavKeys,
      assistantEnabled: true,
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

  private async llmReply(
    tenantId: string | null | undefined,
    system: string,
    message: string,
    locale: "en" | "ar",
    patientId?: string | null,
  ): Promise<string | null> {
    let redaction = null;
    if (tenantId) {
      try {
        const marketCtx = await resolveMarketForTenant(this.prisma, tenantId);
        redaction = redactionForMarket(marketCtx.market.code, marketCtx.providerConfig);
      } catch {
        redaction = redactionForMarket("EG", null);
      }
    }
    const safeMessage = sanitizeAssistantMessageForLlm(message, redaction);
    const userContent = locale === "ar" ? `رد بالعربية. ${safeMessage}` : safeMessage;
    const result = await this.ai.chatCompletion(
      tenantId,
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        temperature: 0.25,
        maxTokens: 1000,
      },
      patientId ? { patientId, locale } : { locale },
    );
    if (!result?.ok) return null;
    return result.content?.trim() || null;
  }

  async chat(user: JwtUser, message: string, localeHint?: string): Promise<AssistantChatResponseDto> {
    const persona = assertAssistantAccess(user);
    if (!(await this.assistantEnabledForUser(user))) {
      throw new ForbiddenException("AI assistant is disabled for this organization or country market");
    }
    const locale = pickLocale(localeHint, message);
    const navKeys = await this.allowedNavKeys(user);
    const tenantId = user.tenantId;

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
    const clinicBreakdown = await this.liveData.tryClinicRevenueBreakdownReply(user, navKeys, message, locale);
    if (clinicBreakdown) {
      return this.replyResponse(user, persona, locale, navKeys, clinicBreakdown);
    }
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
    if (qaEarly && !(await this.ai.llmAvailable(tenantId))) {
      return this.replyResponse(user, persona, locale, navKeys, qaEarly);
    }

    if (tenantId) {
      await this.usage.assertAiAssistantQuota(tenantId);
    }
    const runtime = await this.ai.runtimeForTenant(tenantId);
    const promptVersion = runtime?.promptVersion ?? "v1";
    const liveJson = this.liveData.snapshotForPrompt(snapshot);
    // PRSOP04: the prompt carries the profession and its scope limits.
    const sctx = this.scope ? await this.scope.resolveContext(user.userId) : null;
    const system =
      buildMatureSystemPrompt(persona, navKeys, locale, liveJson, promptVersion) +
      (sctx ? professionPromptClause(sctx.pack, sctx.profession, locale) : "");
    const llm = await this.llmReply(tenantId, system, message, locale);
    if (llm?.trim() && tenantId) {
      await this.usage.incrementOnce(tenantId, UsageMetric.AI_ASSISTANT_REQUESTS, `assistant:${randomUUID()}`);
    }
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