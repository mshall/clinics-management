import { Module } from "@nestjs/common";
import { ComplianceModule } from "../compliance/compliance.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProviderCredentialsService } from "./provider-credentials.service";
import { AiGatewayService } from "./ai/ai-gateway.service";
import { AiRuntimeService } from "./ai/ai-runtime.service";

@Module({
  imports: [PrismaModule, FeatureFlagsModule, ComplianceModule],
  controllers: [],
  providers: [ProviderCredentialsService, AiRuntimeService, AiGatewayService],
  exports: [ProviderCredentialsService, AiRuntimeService, AiGatewayService],
})
export class ProvidersModule {}