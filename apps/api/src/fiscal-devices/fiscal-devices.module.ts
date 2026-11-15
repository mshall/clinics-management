import { Module } from "@nestjs/common";
import { FiscalDevicesController } from "./fiscal-devices.controller";
import { FiscalDevicesService } from "./fiscal-devices.service";
import { FiscalDeviceSecretsService } from "./fiscal-device-secrets.service";

@Module({
  controllers: [FiscalDevicesController],
  providers: [FiscalDevicesService, FiscalDeviceSecretsService],
  exports: [FiscalDevicesService, FiscalDeviceSecretsService],
})
export class FiscalDevicesModule {}