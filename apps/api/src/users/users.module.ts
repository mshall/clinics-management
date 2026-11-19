import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { InvitationsController, PublicInvitationsController } from "./invitations/invitations.controller";
import { InvitationsService } from "./invitations/invitations.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [AuditModule],
  controllers: [UsersController, InvitationsController, PublicInvitationsController],
  providers: [UsersService, InvitationsService, OutboxEventService],
})
export class UsersModule {}
