import { Module } from "@nestjs/common";
import { FiscalDevicesController } from "./fiscal-devices.controller";
import { FiscalDevicesService } from "./fiscal-devices.service";
import { FiscalDeviceSecretsService } from "./fiscal-device-secrets.service";
import { FiscalDeviceProvisioningService } from "./fiscal-device-provisioning.service";

@Module({
  controllers: [FiscalDevicesController],
  providers: [FiscalDevicesService, FiscalDeviceSecretsService, FiscalDeviceProvisioningService],
  exports: [FiscalDevicesService, FiscalDeviceSecretsService, FiscalDeviceProvisioningService],
})
export class FiscalDevicesModule {}