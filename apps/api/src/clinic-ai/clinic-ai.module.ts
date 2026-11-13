import { Module } from "@nestjs/common";
import { ClinicAiController } from "./clinic-ai.controller";
import { ClinicAiService } from "./clinic-ai.service";

@Module({
  controllers: [ClinicAiController],
  providers: [ClinicAiService],
})
export class ClinicAiModule {}
