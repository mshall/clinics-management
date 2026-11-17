import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuditInterceptor } from "./audit.interceptor";
import { AuditService } from "./audit.service";
import { PlatformMoneyAuditService } from "./platform-money-audit.service";

@Global()
@Module({
  providers: [
    AuditService,
    PlatformMoneyAuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditService, PlatformMoneyAuditService],
})
export class AuditModule {}
