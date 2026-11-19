import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { RecordShareModule } from "../marketplace/record-share.module";
import { MessagingModule } from "../messaging/messaging.module";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { PublicRxVerifyController, RxShareController } from "./rx-share.controller";
import { RxShareService } from "./rx-share.service";

/** Separate from ClinicalModule so messaging can be imported without a module cycle. */
@Module({
  imports: [AuditModule, MessagingModule, UserNavTabsModule, RecordShareModule],
  controllers: [RxShareController, PublicRxVerifyController],
  providers: [RxShareService],
  exports: [RxShareService],
})
export class RxShareModule {}
