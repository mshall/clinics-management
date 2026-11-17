import { Injectable } from "@nestjs/common";
import { ConsentPolicyService } from "../../compliance/consent-policy.service";
import { CONSENT_PURPOSE_AI } from "../../compliance/consent-policy.constants";
import { AiRuntimeService } from "./ai-runtime.service";
import type { AiChatCompletionRequest, AiChatCompletionResult } from "./ai-provider.interface";

export type AiGatewayOptions = {
  patientId?: string | null;
  locale?: "en" | "ar";
};

/**
 * SC-03 — single entry for LLM calls; enforces patient AI consent when PHI is tied to a patient.
 */
@Injectable()
export class AiGatewayService {
  constructor(
    private readonly runtime: AiRuntimeService,
    private readonly consent: ConsentPolicyService,
  ) {}

  async chatCompletion(
    tenantId: string | null | undefined,
    request: AiChatCompletionRequest,
    options?: AiGatewayOptions,
  ): Promise<AiChatCompletionResult | null> {
    if (tenantId && options?.patientId?.trim()) {
      await this.consent.require(tenantId, options.patientId.trim(), CONSENT_PURPOSE_AI, {
        locale: options.locale,
      });
    }
    return this.runtime.chatCompletion(tenantId, request);
  }

  llmAvailable(tenantId: string | null | undefined) {
    return this.runtime.llmAvailable(tenantId);
  }

  runtimeForTenant(tenantId: string | null | undefined) {
    return this.runtime.runtimeForTenant(tenantId);
  }
}