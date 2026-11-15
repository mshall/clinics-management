/**
 * Public surface of the fiscal-devices bounded context.
 * Other contexts should import only from here or from injected Nest services.
 */
export { resolveFiscalDeviceForQueue } from "./fiscal-device-resolve";
export {
  provisionDefaultVirtualFiscalDevice,
  fiscalProviderRequiresDevices,
  nextVirtualSerial,
} from "./fiscal-device-provision";