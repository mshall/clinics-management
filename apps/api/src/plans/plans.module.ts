import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PlatformPlansController } from "./platform-plans.controller";
import { PublicPlansController } from "./public-plans.controller";
import { PlansService } from "./plans.service";

@Module({
  imports: [AuthModule],
  controllers: [PublicPlansController, PlatformPlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}