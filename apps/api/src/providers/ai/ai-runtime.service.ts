import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { resolveMarketForTenant } from "../../markets/market-resolver";
import { PrismaService } from "../../prisma/prisma.service";
import { FeatureFlagsService } from "../../feature-flags/feature-flags.service";
import { parseMarketAiConfig } from "./ai-market-config";
import { defaultAiProviderKey, getAiProvider } from "./ai-provider.registry";
import type { AiChatCompletionRequest, AiChatCompletionResult, AiRuntimeConfig } from "./ai-provider.interface";
import { resolveAiApiKey } from "./ai-secret-resolver";

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

@Injectable()
export class AiRuntimeService {
  private readonly log = new Logger(AiRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  async runtimeForTenant(tenantId: string | null | undefined): Promise<AiRuntimeConfig | null> {
    if (!tenantId) return null;

    const aiEnabled = await this.featureFlags.isEnabledForUser(tenantId, "ai_assistant");
    if (!aiEnabled) return null;

    const marketCtx = await resolveMarketForTenant(this.prisma, tenantId);
    const pack = parseMarketAiConfig(marketCtx.providerConfig);
    if (pack?.enabled === false) return null;

    const providerKey = pack?.key?.trim() || defaultAiProviderKey();
    const baseUrl = pack?.baseUrl?.trim() || DEFAULT_BASE;
    const model = pack?.model?.trim() || DEFAULT_MODEL;
    const promptVersion = pack?.promptVersion?.trim() || "v1";
    const apiKey = await resolveAiApiKey(pack?.secretRef ?? null, this.config);
    if (!apiKey) return null;

    return { providerKey, baseUrl, model, apiKey, promptVersion };
  }

  async chatCompletion(tenantId: string | null | undefined, request: AiChatCompletionRequest): Promise<AiChatCompletionResult | null> {
    const runtime = await this.runtimeForTenant(tenantId);
    if (!runtime) return null;
    const provider = getAiProvider(runtime.providerKey);
    if (!provider) {
      this.log.warn(`Unknown AI provider key: ${runtime.providerKey}`);
      return null;
    }
    const result = await provider.chatCompletion(runtime, request);
    if (!result.ok) this.log.warn(result.error);
    return result;
  }

  /** Whether LLM is configured for tenant (for rule-based fallback decisions). */
  async llmAvailable(tenantId: string | null | undefined): Promise<boolean> {
    const runtime = await this.runtimeForTenant(tenantId);
    return Boolean(runtime?.apiKey);
  }
}