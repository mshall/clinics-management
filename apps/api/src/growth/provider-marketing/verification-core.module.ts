import { Module } from "@nestjs/common";
import { OutboxEventService } from "../../messaging/outbox-event.service";
import { VerificationRequestsService } from "./verification-requests.service";

/** Prisma-only half of the verification update requests so MarketplaceModule (signed Kiorex calls) can use it without a cycle with the Growth modules. */
@Module({ providers: [VerificationRequestsService, OutboxEventService], exports: [VerificationRequestsService] })
export class VerificationCoreModule {}
