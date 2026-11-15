import { Module } from "@nestjs/common";
import { MarketsController } from "./markets.controller";
import { MarketProvisionService } from "./market-provision.service";
import { MarketsService } from "./markets.service";

@Module({
  controllers: [MarketsController],
  providers: [MarketsService, MarketProvisionService],
  exports: [MarketsService],
})
export class MarketsModule {}