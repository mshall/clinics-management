import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { isMock } from "../common/provider-mode";
import { PrismaService } from "../prisma/prisma.service";
import { DevInboxRecorder } from "./dev-inbox.recorder";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { metaCloudProviderFromEnv } from "./whatsapp-meta-cloud.provider";
import {
  resolveMarketTemplate,
  whatsAppConfigFromMarket,
  type WhatsAppMarketConfig,
} from "./whatsapp-market-config";
import type { WhatsAppSendResult, WhatsAppTemplateSendInput } from "./whatsapp-provider.types";
import { sendWhatsAppMessageLegacy } from "./whatsapp.provider";

function normalizePhoneE164(phone: string): string {
  return phone.replace(/\s/g, "");
}

function whatsAppSandboxAllowed(toPhone: string): boolean {
  const list = process.env.WHATSAPP_SANDBOX_NUMBERS?.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!list?.length) return true;
  const norm = normalizePhoneE164(toPhone);
  return list.some((n) => normalizePhoneE164(n) === norm);
}

function variablesFromJson(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v != null) out[k] = String(v);
  }
  return out;
}

@Injectable()
export class WhatsAppSendService {
  private readonly log = new Logger(WhatsAppSendService.name);

  constructor(private readonly prisma: PrismaService) {}

  async loadMarketWaConfig(tenantId: string): Promise<WhatsAppMarketConfig | null> {
    const ctx = await resolveMarketForTenant(this.prisma, tenantId);
    return whatsAppConfigFromMarket(ctx.providerConfig);
  }

  /**
   * Production path: approved templates only (no session free-form).
   */
  async sendTemplateForTenant(
    tenantId: string,
    templateKey: string,
    toPhone: string,
    variables: Record<string, string>,
    options?: {
      quickReplies?: string[];
      documentLink?: string;
      documentFilename?: string;
      /** Mock mode: text shown in the dev inbox (the queued message body). */
      renderedBody?: string;
      /** Mock mode: OutboundMessage.id the dev-inbox row mirrors. */
      relatedId?: string;
    },
  ): Promise<WhatsAppSendResult> {
    if (!templateKey?.trim()) {
      throw new BadRequestException("WhatsApp requires an approved template key");
    }
    const waConfig = await this.loadMarketWaConfig(tenantId);
    const marketTpl = resolveMarketTemplate(waConfig, templateKey);
    if (isMock("whatsapp")) {
      // Mock mode (default): same template/variable resolution as real, rendered into the dev inbox instead of Meta.
      const providerMessageId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const preview = options?.renderedBody?.trim() || Object.values(variables).join(" · ") || templateKey;
      await DevInboxRecorder.record({
        channel: "WHATSAPP",
        tenantId,
        toAddress: toPhone,
        templateKey,
        bodyText: preview,
        variables,
        quickReplies: options?.quickReplies ?? marketTpl?.quickReplyButtons ?? null,
        documentLink: options?.documentLink ?? null,
        providerMessageId,
        relatedId: options?.relatedId ?? null,
      });
      return { ok: true, providerMessageId };
    }
    if (!marketTpl) {
      if (process.env.NODE_ENV !== "production") {
        const preview = Object.values(variables).join(" · ") || templateKey;
        return sendWhatsAppMessageLegacy(toPhone, `[${templateKey}] ${preview}`);
      }
      return {
        ok: false,
        error: `No market WhatsApp template for key ${templateKey}`,
        failureClass: "TEMPLATE",
        retryable: false,
      };
    }
    if (process.env.WHATSAPP_SANDBOX_NUMBERS?.trim() && !whatsAppSandboxAllowed(toPhone)) {
      return { ok: true, providerMessageId: `sandbox-${Date.now()}` };
    }

    const variableOrder = marketTpl.variables ?? Object.keys(variables);
    const bodyParameters = variableOrder.map((key) => ({ type: "text" as const, text: variables[key] ?? "" }));

    const input: WhatsAppTemplateSendInput = {
      toPhone,
      templateName: marketTpl.name,
      languageCode: marketTpl.language,
      bodyParameters,
      quickReplyPayloads: options?.quickReplies ?? marketTpl.quickReplyButtons,
      documentLink: options?.documentLink,
      documentFilename: options?.documentFilename,
    };

    if (!(process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN)) {
      if (process.env.NODE_ENV === "production") {
        return { ok: false, error: "WHATSAPP_ACCESS_TOKEN not configured", failureClass: "AUTH", retryable: false };
      }
      return { ok: true, providerMessageId: `dev-${Date.now()}` };
    }

    const provider = metaCloudProviderFromEnv(waConfig?.phoneNumberId);
    if (!provider) {
      return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID not configured", failureClass: "AUTH", retryable: false };
    }

    const result = await provider.sendTemplate(input);
    if (!result.ok) {
      this.log.warn(`WhatsApp template ${marketTpl.name} failed: ${result.error}`);
    }
    return result;
  }

  buildVariablesForOutbound(
    templateKey: string | null | undefined,
    variablesJson: unknown,
    body: string,
  ): Record<string, string> {
    const fromJson = variablesFromJson(variablesJson);
    if (Object.keys(fromJson).length) return fromJson;
    if (templateKey === "auth_otp") {
      const match = /(\d{4,8})/.exec(body);
      if (match) return { code: match[1]! };
    }
    return { body };
  }
}