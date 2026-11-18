import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { SlotHoldService } from "./slot-hold.service";
import { MarketplaceBookingService } from "./marketplace-booking.service";

const SCAN_MS = 60_000;

@Injectable()
export class SlotHoldExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SlotHoldExpiryScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly holds: SlotHoldService,
    private readonly bookings: MarketplaceBookingService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.tick().catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    }, SCAN_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    await this.holds.releaseExpired();
    await this.bookings.processConfirmationTimeouts();
  }
}