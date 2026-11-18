import { Global, Module } from "@nestjs/common";
import { ObservabilityHealthService } from "./observability-health.service";

@Global()
@Module({
  providers: [ObservabilityHealthService],
  exports: [ObservabilityHealthService],
})
export class ObservabilityModule {}