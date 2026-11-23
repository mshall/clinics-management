import { Module } from "@nestjs/common";
import { AppointmentsModule } from "../appointments/appointments.module";
import { AuditModule } from "../audit/audit.module";
import { EntitlementsModule } from "../entitlements/entitlements.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { InternalJobKeyGuard } from "../home-visits/internal-job-key.guard";
import { MessagingModule } from "../messaging/messaging.module";
import { PatientsModule } from "../patients/patients.module";
import { providerMode } from "../common/provider-mode";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { UserNavTabsModule } from "../user-nav-tabs/user-nav-tabs.module";
import { PrismaService } from "../prisma/prisma.service";
import { HttpPollingSignaling } from "./signaling/http-polling.signaling";
import { SIGNALING_TRANSPORT } from "./signaling/signaling-transport";
import { TelehealthInternalController } from "./telehealth-internal.controller";
import { TelehealthNotifier } from "./telehealth-notifier.service";
import { TelehealthPublicController } from "./telehealth-public.controller";
import { TelehealthScheduler } from "./telehealth.scheduler";
import { TelehealthController } from "./telehealth.controller";
import { TelehealthService } from "./telehealth.service";
import { CloudflareTurnProvider } from "./turn/cloudflare-turn.provider";
import { StunOnlyTurnProvider } from "./turn/stun-only.provider";
import { TURN_CREDENTIALS_PROVIDER, type TurnCredentialsProvider } from "./turn/turn-credentials.provider";
import { P2PWebRtcProvider } from "./video/p2p-webrtc.provider";
import { VIDEO_PROVIDER } from "./video/video-provider";

/** ADR-039 telehealth: Clinic owns the session; media is browser-to-browser WebRTC (no vendor, no recording). */
@Module({
  imports: [AppointmentsModule, AuditModule, EntitlementsModule, FeatureFlagsModule, MessagingModule, PatientsModule, SubscriptionsModule, UserNavTabsModule],
  controllers: [TelehealthController, TelehealthPublicController, TelehealthInternalController],
  providers: [
    InternalJobKeyGuard,
    // KIORLY_PROVIDER_MODE_TURN=real + the Cloudflare secret => short-lived TURN; anything else => STUN-only (local dev, CI).
    { provide: TURN_CREDENTIALS_PROVIDER, useFactory: (): TurnCredentialsProvider => (providerMode("turn") === "real" ? new CloudflareTurnProvider() : new StunOnlyTurnProvider()) },
    { provide: VIDEO_PROVIDER, useFactory: (turn: TurnCredentialsProvider) => new P2PWebRtcProvider(turn), inject: [TURN_CREDENTIALS_PROVIDER] },
    { provide: SIGNALING_TRANSPORT, useFactory: (p: PrismaService) => new HttpPollingSignaling(p), inject: [PrismaService] },
    TelehealthNotifier,
    TelehealthService,
    TelehealthScheduler,
  ],
  exports: [TelehealthService, TelehealthNotifier],
})
export class TelehealthModule {}
