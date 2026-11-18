import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { OutboxDispatcherService } from "./outbox-dispatcher.service";

const SCAN_MS = 5_000;

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