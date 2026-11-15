import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { privilegedMfaDisableAttemptInProduction } from "./privileged-mfa-enforcement";

@Injectable()
export class PrivilegedMfaPolicyService implements OnModuleInit {
  private readonly log = new Logger(PrivilegedMfaPolicyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (!privilegedMfaDisableAttemptInProduction()) return;
    this.log.warn(
      "PRIVILEGED_MFA_ENFORCE=false is ignored on AWS production; privileged MFA remains required. Writing audit record.",
    );
    try {
      const tenant = await this.prisma.tenant.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
      if (!tenant) return;
      await this.prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          clinicId: null,
          actorId: null,
          action: "PRIVILEGED_MFA_DISABLE_IGNORED",
          resource: "platform.security",
          metadata: {
            env: "production",
            deployTarget: process.env.KIORLY_DEPLOY_TARGET ?? null,
            note: "PRIVILEGED_MFA_ENFORCE=false was set but MFA enforcement remains active",
          },
        },
      });
    } catch (err) {
      this.log.error(`Failed to audit privileged MFA policy: ${err instanceof Error ? err.message : err}`);
    }
  }
}