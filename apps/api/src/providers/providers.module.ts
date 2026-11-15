import { Module } from "@nestjs/common";
import { ProviderCredentialsService } from "./provider-credentials.service";
import { ProviderCredentialsController } from "./provider-credentials.controller";
import { AiRuntimeService } from "./ai/ai-runtime.service";

@Module({
  controllers: [ProviderCredentialsController],
  providers: [ProviderCredentialsService, AiRuntimeService],
  exports: [ProviderCredentialsService, AiRuntimeService],
})
export class ProvidersModule {}