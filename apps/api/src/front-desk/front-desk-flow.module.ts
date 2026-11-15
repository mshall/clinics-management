import { Module } from "@nestjs/common";
import { FrontDeskFlowService } from "./front-desk-flow.service";

@Module({
  providers: [FrontDeskFlowService],
  exports: [FrontDeskFlowService],
})
export class FrontDeskFlowModule {}