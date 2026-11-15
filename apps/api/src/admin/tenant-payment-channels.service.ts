import { Injectable, NotFoundException } from "@nestjs/common";
import type { JwtUser } from "../auth/jwt-user";
import { assertPaymentChannelContactFields, channelKeyFromPaymentChannelName } from "../common/tenant-payment-channel-key";
import { PrismaService } from "../prisma/prisma.service";
import { mapOrganizationPaymentChannel } from "../markets/tenant-payment-channel-merge";
import type { CreateTenantPaymentChannelDto } from "./dto/create-tenant-payment-channel.dto";

@Injectable()
export class TenantPaymentChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const rows = await this.prisma.tenantPaymentChannel.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
    return { channels: rows.map(mapOrganizationPaymentChannel) };
  }

  async create(user: JwtUser, tenantId: string, dto: CreateTenantPaymentChannelDto) {
    const name = dto.name.trim();
    assertPaymentChannelContactFields(dto.accountNumber, dto.mobileNumber);
    const existing = await this.prisma.tenantPaymentChannel.findMany({
      where: { tenantId },
      select: { channelKey: true },
    });
    const channelKey = channelKeyFromPaymentChannelName(
      name,
      existing.map((e) => e.channelKey),
    );
    const accountNumber = dto.accountNumber?.trim() || null;
    const mobileNumber = dto.mobileNumber?.trim() || null;

    const row = await this.prisma.tenantPaymentChannel.create({
      data: {
        tenantId,
        name,
        channelKey,
        accountNumber,
        mobileNumber,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: "TENANT_PAYMENT_CHANNEL_CREATE",
        resource: "tenant_payment_channel",
        resourceId: row.id,
        metadata: { name, channelKey },
      },
    });

    return mapOrganizationPaymentChannel(row);
  }

  async remove(user: JwtUser, tenantId: string, id: string) {
    const row = await this.prisma.tenantPaymentChannel.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("Payment channel not found");
    await this.prisma.tenantPaymentChannel.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorId: user.userId,
        action: "TENANT_PAYMENT_CHANNEL_DELETE",
        resource: "tenant_payment_channel",
        resourceId: id,
        metadata: { name: row.name, channelKey: row.channelKey },
      },
    });
    return { ok: true };
  }
}