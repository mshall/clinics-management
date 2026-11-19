import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";

@Module({
  imports: [AuditModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
