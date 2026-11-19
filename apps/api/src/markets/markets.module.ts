import { Module } from "@nestjs/common";
import { MarketsController } from "./markets.controller";
import { TenantMarketController } from "./tenant-market.controller";
import { MarketProvisionService } from "./market-provision.service";
import { CommercialConfigService } from "./commercial-config.service";
import { LegalConfigService } from "./legal-config.service";
import { MarketsService } from "./markets.service";

@Module({
  controllers: [MarketsController, TenantMarketController],
  providers: [MarketsService, MarketProvisionService, CommercialConfigService, LegalConfigService],
  exports: [MarketsService, CommercialConfigService, LegalConfigService],
})
export class MarketsModule {}