import { Global, Module } from "@nestjs/common";
import { UsageController } from "./usage.controller";
import { UsageMeterService } from "./usage-meter.service";

@Global()
@Module({
  controllers: [UsageController],
  providers: [UsageMeterService],
  exports: [UsageMeterService],
})
export class UsageModule {}