import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";

const SCAN_MS = Math.max(250, Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 5_000) || 5_000); // 5 s by default; a private test stack sets OUTBOX_POLL_INTERVAL_MS

@Injectable()
export class OutboxDispatcherScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(OutboxDispatcherScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly dispatcher: OutboxDispatcherService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.dispatcher.processBatch().catch((e) => {
        this.log.warn(e instanceof Error ? e.message : String(e));
      });
    }, SCAN_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}