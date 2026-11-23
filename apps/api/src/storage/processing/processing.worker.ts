import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DocumentProcessingService } from "./document-processing.service";

const TICK_MS = 10_000;

@Injectable()
export class StorageProcessingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(StorageProcessingWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly processing: DocumentProcessingService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test" || process.env.KIORLY_DISABLE_SCHEDULERS === "1") return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const ids = await this.processing.claimPendingIds(5);
      for (const id of ids) {
        await this.processing.processOneJob(id);
      }
    } catch (e) {
      this.log.warn(`storage_worker_tick ${e instanceof Error ? e.message : "error"}`);
    } finally {
      this.running = false;
    }
  }
}
