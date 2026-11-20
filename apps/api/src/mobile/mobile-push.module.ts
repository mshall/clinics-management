import { Global, Module } from "@nestjs/common";
import { MobilePushService } from "./mobile-push.service";

/** Global so domain services (check-in, safety alerts, lab results) can mirror events into the staff app inbox without importing MobileModule (avoids cycles). */
@Global()
@Module({ providers: [MobilePushService], exports: [MobilePushService] })
export class MobilePushModule {}
