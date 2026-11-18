import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { LegalModule } from "../legal/legal.module";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { OnboardingModule } from "../onboarding/onboarding.module";
import { SignupModule } from "../signup/signup.module";
import { PlatformSalesRepsController, SalesRepsController } from "./sales-reps.controller";
import { SalesRepsService } from "./sales-reps.service";

@Module({
  imports: [AuditModule, LegalModule, OnboardingModule, SignupModule],
  controllers: [SalesRepsController, PlatformSalesRepsController],
  providers: [SalesRepsService, OutboxEventService],
})
export class SalesRepsModule {}
