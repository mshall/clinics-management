import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FiscalDeviceKind,
  FiscalDeviceStatus,
  FiscalSubmissionStatus,
  type Prisma,
} from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { fiscalProviderKeyForMarket, getFiscalProvider } from "../providers/fiscal/fiscal-provider.registry";
import { resolveMarketForTenant } from "../markets/market-resolver";
import { assertFiscalDeviceAccess } from "./fiscal-device-access";
import { assertValidFiscalSerial, formatVirtualSerial } from "./generate-virtual-serial";
import { countVirtualDevicesForClinic, nextVirtualSerial } from "./fiscal-device-provision";
import { FiscalDeviceSecretsService, type FiscalCredentialPayload } from "./fiscal-device-secrets.service";
import { resolveEtaConnection } from "../compliance/eta-secret-resolver";

function mapDevice(row: {
  id: string;
  clinicId: string;
  providerKey: string;
  kind: FiscalDeviceKind;
  serialNumber: string;
  label: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  status: FiscalDeviceStatus;
  isDefault: boolean;
  credentialId: string | null;
  lastReceiptUuid: string | null;
  receiptSequence: number;
  lastSubmittedAt: Date | null;
  registeredAt: Date | null;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
  statusReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  credential?: { id: string; secretRef: string } | null;
}) {
  return {
    id: row.id,
    clinicId: row.clinicId,
    providerKey: row.providerKey,
    kind: row.kind,
    serialNumber: row.serialNumber,
    label: row.label,
    deviceModel: row.deviceModel,
    osVersion: row.osVersion,
    status: row.status,
    isDefault: row.isDefault,
    hasCredentials: Boolean(row.credentialId),
    lastReceiptUuid: row.lastReceiptUuid,
    receiptSequence: row.receiptSequence,
    lastSubmittedAt: row.lastSubmittedAt?.toISOString() ?? null,
    registeredAt: row.registeredAt?.toISOString() ?? null,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    statusReason: row.statusReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class FiscalDevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly secrets: FiscalDeviceSecretsService,
  ) {}

  async listForClinic(user: JwtUser, tenantId: string, clinicId: string) {
    await assertFiscalDeviceAccess(this.prisma, user, clinicId, tenantId);
    const rows = await this.prisma.fiscalDevice.findMany({
      where: { tenantId, clinicId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: { credential: { select: { id: true, secretRef: true } } },
    });
    return { devices: rows.map(mapDevice) };
  }

  async createForClinic(
    user: JwtUser,
    tenantId: string,
    clinicId: string,
    body: {
      kind: FiscalDeviceKind;
      providerKey?: string;
      label?: string;
      serialNumber?: string;
      deviceModel?: string;
      osVersion?: string;
    },
  ) {
    await assertFiscalDeviceAccess(this.prisma, user, clinicId, tenantId);
    const marketCtx = await resolveMarketForTenant(this.prisma, tenantId);
    const providerKey = body.providerKey?.trim() || fiscalProviderKeyForMarket(marketCtx.taxConfig);
    const provider = getFiscalProvider(providerKey);
    if (!provider) throw new BadRequestException("Unknown fiscal provider");

    const kind = body.kind;
    let serial: string;
    if (kind === FiscalDeviceKind.VIRTUAL) {
      serial = await nextVirtualSerial(this.prisma, tenantId, clinicId, marketCtx.market.code, providerKey);
    } else {
      if (!body.serialNumber?.trim()) throw new BadRequestException("serialNumber is required for physical devices");
      serial = assertValidFiscalSerial(body.serialNumber);
    }

    const isFirst = !(await this.prisma.fiscalDevice.findFirst({ where: { tenantId, clinicId, providerKey } }));
    const row = await this.prisma.fiscalDevice.create({
      data: {
        tenantId,
        clinicId,
        providerKey,
        kind,
        serialNumber: serial,
        label: body.label?.trim() || (kind === FiscalDeviceKind.VIRTUAL ? "Kiorly virtual POS" : null),
        deviceModel: body.deviceModel?.trim() || null,
        osVersion: body.osVersion?.trim() || null,
        status: FiscalDeviceStatus.CREDENTIALS_PENDING,
        isDefault: isFirst,
      },
      include: { credential: { select: { id: true, secretRef: true } } },
    });

    await this.audit.recordEvent({
      tenantId,
      actorId: user.userId,
      clinicId,
      action: "FISCAL_DEVICE_CREATE",
      resource: "fiscal_device",
      resourceId: row.id,
      metadata: { kind, serialNumber: serial, providerKey },
    });

    return mapDevice(row);
  }

  async patch(user: JwtUser, tenantId: string, id: string, body: { label?: string; isDefault?: boolean; status?: string }) {
    const row = await this.prisma.fiscalDevice.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("Fiscal device not found");
    await assertFiscalDeviceAccess(this.prisma, user, row.clinicId, tenantId);

    const data: Prisma.FiscalDeviceUpdateInput = {};
    if (body.label !== undefined) data.label = body.label?.trim() || null;
    if (body.isDefault === true) {
      await this.prisma.fiscalDevice.updateMany({
        where: { tenantId, clinicId: row.clinicId, providerKey: row.providerKey, NOT: { id } },
        data: { isDefault: false },
      });
      data.isDefault = true;
    }
    if (body.status === "ACTIVE" || body.status === "SUSPENDED") {
      if (body.status === "ACTIVE" && !row.credentialId) {
        throw new BadRequestException("Cannot activate without credentials");
      }
      data.status = body.status as FiscalDeviceStatus;
      if (body.status === "SUSPENDED") data.statusReason = "Suspended by administrator";
      if (body.status === "ACTIVE") {
        data.activatedAt = new Date();
        data.statusReason = null;
      }
    }

    const updated = await this.prisma.fiscalDevice.update({
      where: { id },
      data,
      include: { credential: { select: { id: true, secretRef: true } } },
    });

    await this.audit.recordEvent({
      tenantId,
      actorId: user.userId,
      clinicId: row.clinicId,
      action: "FISCAL_DEVICE_PATCH",
      resource: "fiscal_device",
      resourceId: id,
      metadata: body,
    });

    return mapDevice(updated);
  }

  async attachCredentials(
    user: JwtUser,
    tenantId: string,
    id: string,
    payload: FiscalCredentialPayload,
  ) {
    const row = await this.prisma.fiscalDevice.findFirst({
      where: { id, tenantId },
      include: { credential: true },
    });
    if (!row) throw new NotFoundException("Fiscal device not found");
    await assertFiscalDeviceAccess(this.prisma, user, row.clinicId, tenantId);
    if (!payload.clientId?.trim() || !payload.clientSecret?.trim()) {
      throw new BadRequestException("clientId and clientSecret are required");
    }

    const secretRef = await this.secrets.storeDeviceCredentials(
      tenantId,
      row.providerKey,
      row.serialNumber,
      { ...payload, posSerial: payload.posSerial || row.serialNumber },
    );

    const result = await this.prisma.$transaction(async (tx) => {
      let credentialId = row.credentialId;
      if (row.credential) {
        await tx.providerCredential.update({
          where: { id: row.credential.id },
          data: {
            secretRef,
            deviceId: row.serialNumber,
            clinicId: row.clinicId,
          },
        });
        credentialId = row.credential.id;
      } else {
        const cred = await tx.providerCredential.create({
          data: {
            tenantId,
            clinicId: row.clinicId,
            providerKey: row.providerKey,
            deviceId: row.serialNumber,
            secretRef,
            label: row.label || `POS ${row.serialNumber}`,
          },
        });
        credentialId = cred.id;
      }

      const updated = await tx.fiscalDevice.update({
        where: { id },
        data: {
          credentialId,
          status: FiscalDeviceStatus.ACTIVE,
          activatedAt: new Date(),
          statusReason: null,
        },
        include: { credential: { select: { id: true, secretRef: true } } },
      });
      return updated;
    });

    await this.audit.recordEvent({
      tenantId,
      actorId: user.userId,
      clinicId: row.clinicId,
      action: "FISCAL_DEVICE_CREDENTIALS",
      resource: "fiscal_device",
      resourceId: id,
      metadata: { providerKey: row.providerKey, serialNumber: row.serialNumber },
    });

    return mapDevice(result);
  }

  async testConnection(user: JwtUser, tenantId: string, id: string) {
    const row = await this.prisma.fiscalDevice.findFirst({
      where: { id, tenantId },
      include: { credential: true },
    });
    if (!row) throw new NotFoundException("Fiscal device not found");
    await assertFiscalDeviceAccess(this.prisma, user, row.clinicId, tenantId);
    if (!row.credential?.secretRef) {
      return { ok: false, error: "No credentials configured" };
    }

    if (process.env.NODE_ENV === "production" && process.env.KIORLY_DEPLOY_TARGET === "aws") {
      const ref = row.credential.secretRef.trim();
      if (ref.startsWith("local:") || ref.startsWith("env:")) {
        return { ok: false, error: "Production requires Secrets Manager credentials on the device" };
      }
    }

    const connection = await resolveEtaConnection(row.credential.secretRef);
    if (!connection?.clientId || !connection.clientSecret) {
      return { ok: false, error: "Could not resolve device credentials" };
    }
    const tokenUrl =
      connection.tokenUrl?.trim() ||
      process.env.ETA_TOKEN_URL?.trim() ||
      `${connection.baseUrl.replace(/\/$/, "")}/connect/token`;
    try {
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(connection.posSerial ? { posserial: connection.posSerial } : { posserial: row.serialNumber }),
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: connection.clientId,
          client_secret: connection.clientSecret,
          scope: connection.oauthScope || "InvoicingAPI",
        }),
      });
      if (!res.ok) return { ok: false, error: `Token request failed (${res.status})` };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Token request failed" };
    }
  }

  async deactivate(user: JwtUser, tenantId: string, id: string) {
    const row = await this.prisma.fiscalDevice.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("Fiscal device not found");
    await assertFiscalDeviceAccess(this.prisma, user, row.clinicId, tenantId);

    const pending = await this.prisma.fiscalSubmission.count({
      where: {
        fiscalDeviceId: id,
        status: { in: [FiscalSubmissionStatus.PENDING, FiscalSubmissionStatus.REJECTED] },
      },
    });
    if (pending > 0) {
      throw new BadRequestException("Cannot deactivate device with pending fiscal submissions");
    }

    const updated = await this.prisma.fiscalDevice.update({
      where: { id },
      data: {
        status: FiscalDeviceStatus.DEACTIVATED,
        deactivatedAt: new Date(),
        isDefault: false,
      },
      include: { credential: { select: { id: true, secretRef: true } } },
    });

    await this.audit.recordEvent({
      tenantId,
      actorId: user.userId,
      clinicId: row.clinicId,
      action: "FISCAL_DEVICE_DEACTIVATE",
      resource: "fiscal_device",
      resourceId: id,
    });

    return mapDevice(updated);
  }

  async clinicSetupStatus(tenantId: string, clinicId: string) {
    const marketCtx = await resolveMarketForTenant(this.prisma, tenantId);
    const providerKey = fiscalProviderKeyForMarket(marketCtx.taxConfig);
    const provider = getFiscalProvider(providerKey);
    if (!provider?.deviceRegistration?.required) {
      return { requiresDevice: false, ready: true, providerKey };
    }
    const active = await this.prisma.fiscalDevice.findFirst({
      where: {
        tenantId,
        clinicId,
        providerKey,
        isDefault: true,
        status: FiscalDeviceStatus.ACTIVE,
        credentialId: { not: null },
      },
    });
    return {
      requiresDevice: true,
      ready: Boolean(active),
      providerKey,
      deviceRegistration: provider.deviceRegistration,
    };
  }
}