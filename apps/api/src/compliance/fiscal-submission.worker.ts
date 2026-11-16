import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { FiscalDeviceStatus, FiscalSubmissionStatus, IntegrationFailureCategory } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FiscalSubmitService } from "./fiscal-submit.service";

const POLL_MS = 20_000;
const DEVICE_BATCH = 40;
const ALERT_AFTER_ATTEMPTS = 8;

function workerInstanceId(): string {
  return process.env.FISCAL_WORKER_ID?.trim() || process.env.HOSTNAME?.trim() || "kiorly-worker";
}

@Injectable()
export class FiscalSubmissionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(FiscalSubmissionWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly submit: FiscalSubmitService,
  ) {}

  onModuleInit() {
    if (process.env.FISCAL_SUBMIT_WORKER === "false") return;
    this.timer = setInterval(() => {
      void this.tick().catch((e) => this.log.warn(e instanceof Error ? e.message : String(e)));
    }, POLL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    const devices = await this.prisma.fiscalDevice.findMany({
      where: { status: FiscalDeviceStatus.ACTIVE },
      select: { id: true, tenantId: true, clinicId: true, serialNumber: true },
      take: DEVICE_BATCH,
    });
    const now = new Date();
    const workerId = workerInstanceId();
    for (const device of devices) {
      const head = await this.prisma.fiscalSubmission.findFirst({
        where: {
          fiscalDeviceId: device.id,
          status: { in: [FiscalSubmissionStatus.PENDING, FiscalSubmissionStatus.SUBMITTING] },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        orderBy: { createdAt: "asc" },
      });
      if (!head) continue;
      if (
        head.claimedUntil &&
        head.claimedUntil > now &&
        head.claimedBy &&
        head.claimedBy !== workerId
      ) {
        continue;
      }

      try {
        await this.submit.submitOne(head.tenantId, head.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`Fiscal submit failed ${head.id}: ${msg}`);
        const attempts = head.submitAttempts + 1;
        const backoffMinutes = Math.min(60, Math.pow(2, Math.min(attempts, 6)));
        await this.prisma.fiscalSubmission.update({
          where: { id: head.id },
          data: {
            submitAttempts: attempts,
            nextRetryAt: new Date(Date.now() + backoffMinutes * 60_000),
            errorMessage: msg.slice(0, 2000),
          },
        });
        if (attempts >= ALERT_AFTER_ATTEMPTS) {
          await this.prisma.integrationFailureLog.create({
            data: {
              tenantId: device.tenantId,
              clinicId: device.clinicId,
              category: IntegrationFailureCategory.FISCAL,
              operation: "fiscal_submit_exhausted",
              operationName: "Fiscal receipt submit",
              statusCode: 502,
              fingerprint: `fiscal-submit:${device.id}:${head.id}`,
              errorMessage: `Failed ${attempts} times for device ${device.serialNumber}`,
              reasonDetail: msg.slice(0, 500),
              trace: { steps: [{ step: "submitOne", ok: false, detail: msg }] },
            },
          });
        }
      }
    }
  }
}