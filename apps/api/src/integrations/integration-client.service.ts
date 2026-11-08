import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ClinicRecordStatus, IntegrationScope, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import type { IntegrationPrincipal } from "./integration.types";
import {
  formatIntegrationBearerToken,
  generateClientKey,
  generateClientSecret,
  hashIntegrationSecret,
  verifyIntegrationSecret,
} from "./integration-token";
import {
  findInvalidClinicAllowlistIds,
  normalizeAllowedClinicIds,
} from "./integration-clinic-allowlist";

const ADMIN_ROLES: Set<UserRole> = new Set([UserRole.GROUP_ADMIN, UserRole.CLINIC_ADMIN]);

@Injectable()
export class IntegrationClientService {
  constructor(private readonly prisma: PrismaService) {}

  assertAdminManage(user: JwtUser): void {
    if (!user.tenantId || !ADMIN_ROLES.has(user.role)) {
      throw new UnauthorizedException("Only organization administrators can manage integration clients");
    }
  }

  async authenticateBearer(clientKey: string, secret: string): Promise<IntegrationPrincipal> {
    const row = await this.prisma.integrationClient.findFirst({
      where: { clientKey, deactivatedAt: null },
    });
    if (!row) throw new UnauthorizedException("Unknown integration client");
    const ok = await verifyIntegrationSecret(secret, row.secretHash);
    if (!ok) throw new UnauthorizedException("Invalid integration API token");

    void this.prisma.integrationClient
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      id: row.id,
      clientKey: row.clientKey,
      tenantId: row.tenantId,
      name: row.name,
      scopes: row.scopes,
      allowedClinicIds: row.allowedClinicIds ?? [],
    };
  }

  listClients(tenantId: string) {
    return this.prisma.integrationClient.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        clientKey: true,
        scopes: true,
        allowedClinicIds: true,
        lastUsedAt: true,
        deactivatedAt: true,
        createdAt: true,
      },
    });
  }

  private async resolveAllowedClinicIds(tenantId: string, allowedClinicIds: string[] | undefined): Promise<string[]> {
    const normalized = normalizeAllowedClinicIds(allowedClinicIds);
    if (!normalized.length) return [];
    const clinics = await this.prisma.clinic.findMany({
      where: { tenantId, recordStatus: ClinicRecordStatus.ACTIVE, id: { in: normalized } },
      select: { id: true },
    });
    const valid = new Set(clinics.map((c) => c.id));
    const invalid = findInvalidClinicAllowlistIds(normalized, valid);
    if (invalid.length) {
      throw new BadRequestException(`Unknown or inactive clinic id(s): ${invalid.join(", ")}`);
    }
    return normalized;
  }

  async createClient(
    tenantId: string,
    actor: JwtUser,
    body: { name: string; scopes?: IntegrationScope[]; allowedClinicIds?: string[] },
  ) {
    const clientKey = generateClientKey();
    const secret = generateClientSecret();
    const secretHash = await hashIntegrationSecret(secret);
    const scopes = body.scopes?.length ? body.scopes : [IntegrationScope.APPOINTMENTS_READ, IntegrationScope.APPOINTMENTS_WRITE];
    const allowedClinicIds = await this.resolveAllowedClinicIds(tenantId, body.allowedClinicIds);
    const row = await this.prisma.integrationClient.create({
      data: {
        tenantId,
        name: body.name.trim(),
        clientKey,
        secretHash,
        scopes,
        allowedClinicIds,
        createdByUserId: actor.userId,
      },
    });
    return {
      id: row.id,
      name: row.name,
      clientKey: row.clientKey,
      scopes: row.scopes,
      allowedClinicIds: row.allowedClinicIds,
      bearerToken: formatIntegrationBearerToken(clientKey, secret),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async rotateSecret(tenantId: string, id: string) {
    const existing = await this.prisma.integrationClient.findFirst({ where: { id, tenantId, deactivatedAt: null } });
    if (!existing) throw new NotFoundException("Integration client not found");
    const secret = generateClientSecret();
    const secretHash = await hashIntegrationSecret(secret);
    await this.prisma.integrationClient.update({ where: { id }, data: { secretHash } });
    return {
      clientKey: existing.clientKey,
      bearerToken: formatIntegrationBearerToken(existing.clientKey, secret),
    };
  }

  async deactivate(tenantId: string, id: string) {
    const existing = await this.prisma.integrationClient.findFirst({ where: { id, tenantId, deactivatedAt: null } });
    if (!existing) throw new NotFoundException("Integration client not found");
    await this.prisma.integrationClient.update({ where: { id }, data: { deactivatedAt: new Date() } });
    return { ok: true };
  }

  clinicAllowed(principal: IntegrationPrincipal, clinicId: string): boolean {
    if (!principal.allowedClinicIds.length) return true;
    return principal.allowedClinicIds.includes(clinicId);
  }
}
