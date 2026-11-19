import { Module } from "@nestjs/common";
import { CohortService } from "./cohort.service";
import { PublicCohortsController } from "./public-cohorts.controller";

@Module({
  controllers: [PublicCohortsController],
  providers: [CohortService],
  exports: [CohortService],
})
export class CohortsModule {}