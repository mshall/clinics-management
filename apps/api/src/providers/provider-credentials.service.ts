import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { JwtUser } from "../auth/jwt-user";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";

export type CreateProviderCredentialDto = {
  providerKey: string;
  secretRef: string;
  clinicId?: string | null;
  deviceId?: string | null;
  label?: string | null;
};

@Injectable()
export class ProviderCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTenant(tenantId: string) {
    const rows = await this.prisma.providerCredential.findMany({
      where: { tenantId },
      orderBy: [{ providerKey: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        providerKey: true,
        clinicId: true,
        deviceId: true,
        secretRef: true,
        label: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async create(tenantId: string, dto: CreateProviderCredentialDto) {
    const providerKey = dto.providerKey?.trim();
    const secretRef = dto.secretRef?.trim();
    if (!providerKey) throw new BadRequestException("providerKey is required");
    if (!secretRef || secretRef.length < 8) {
      throw new BadRequestException("secretRef must be a Secrets Manager ARN or path (min 8 chars)");
    }
    if (dto.clinicId) {
      const clinic = await this.prisma.clinic.findFirst({ where: { id: dto.clinicId, tenantId } });
      if (!clinic) throw new NotFoundException("Clinic not found");
    }
    const row = await this.prisma.providerCredential.create({
      data: {
        tenantId,
        providerKey,
        secretRef,
        clinicId: dto.clinicId?.trim() || null,
        deviceId: dto.deviceId?.trim() || null,
        label: dto.label?.trim() || null,
      },
    });
    return {
      id: row.id,
      providerKey: row.providerKey,
      clinicId: row.clinicId,
      deviceId: row.deviceId,
      secretRef: row.secretRef,
      label: row.label,
    };
  }

  async remove(tenantId: string, id: string) {
    const row = await this.prisma.providerCredential.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("Credential not found");
    await this.prisma.providerCredential.delete({ where: { id } });
    return { ok: true };
  }

  async listForPlatform(user: JwtUser, tenantId: string) {
    if (!isPlatformSuperAdmin(user)) throw new ForbiddenException("Platform super admin only");
    return this.listForTenant(tenantId);
  }
}