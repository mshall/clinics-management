import { Module } from "@nestjs/common";
import { ProviderCredentialsService } from "./provider-credentials.service";
import { ProviderCredentialsController } from "./provider-credentials.controller";

@Module({
  controllers: [ProviderCredentialsController],
  providers: [ProviderCredentialsService],
  exports: [ProviderCredentialsService],
})
export class ProvidersModule {}