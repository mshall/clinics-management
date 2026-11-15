import { Module } from "@nestjs/common";
import { FiscalDevicesModule } from "../fiscal-devices/fiscal-devices.module";
import { ClinicsController } from "./clinics.controller";
import { ClinicsService } from "./clinics.service";

@Module({
  imports: [FiscalDevicesModule],
  controllers: [ClinicsController],
  providers: [ClinicsService],
  exports: [ClinicsService],
})
export class ClinicsModule {}
