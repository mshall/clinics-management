import { Module } from "@nestjs/common";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { ClinicsController } from "./clinics.controller";
import { ClinicsService } from "./clinics.service";

@Module({
  imports: [UserNavTabsModule],
  controllers: [ClinicsController],
  providers: [ClinicsService],
  exports: [ClinicsService],
})
export class ClinicsModule {}
