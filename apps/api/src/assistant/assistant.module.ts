import { Module } from "@nestjs/common";
import { ClinicsModule } from "../clinics/clinics.module";
import { RevenueModule } from "../revenue/revenue.module";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { AssistantController } from "./assistant.controller";
import { AssistantLiveDataService } from "./assistant-live-data.service";
import { AssistantService } from "./assistant.service";

@Module({
  imports: [UserNavTabsModule, ClinicsModule, RevenueModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantLiveDataService],
})
export class AssistantModule {}
