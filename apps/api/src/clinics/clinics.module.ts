import { Module } from "@nestjs/common";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { FiscalDevicesModule } from "../fiscal-devices/fiscal-devices.module";
import { ClinicsController } from "./clinics.controller";
import { ClinicsService } from "./clinics.service";

@Module({
  imports: [FiscalDevicesModule, UserNavTabsModule],
  controllers: [ClinicsController],
  providers: [ClinicsService],
  exports: [ClinicsService],
})
export class ClinicsModule {}
