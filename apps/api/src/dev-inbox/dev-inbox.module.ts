import { Module } from "@nestjs/common";
import { BillingPlatformModule } from "../billing-platform/billing-platform.module";
import { MessagingModule } from "../messaging/messaging.module";
import { DevInboxController } from "./dev-inbox.controller";
import { DevInboxGuard } from "./dev-inbox.guard";
import { DevInboxService } from "./dev-inbox.service";

/** Mock-provider dev inbox + simulators (CLAUDE.md: messaging & provider integrations are MOCKED for now). */
@Module({
  imports: [MessagingModule, BillingPlatformModule],
  controllers: [DevInboxController],
  providers: [DevInboxService, DevInboxGuard],
})
export class DevInboxModule {}
