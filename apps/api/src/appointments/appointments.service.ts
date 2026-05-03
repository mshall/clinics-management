import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, Prisma, RevenueStatus } from "@prisma/client";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAppointmentDto } from "./dto/create-appointment.dto";
import type { AppointmentDto } from "./dto/appointment.dto";
import type { UpdateAppointmentDto } from "./dto/update-appointment.dto";

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(a: {
    id: string;
    clinicId: string;
    patientId: string;
    clinicianId: string;
    startsAt: Date;
    endsAt: Date;
    status: AppointmentStatus;
    notes: string | null;
    feeAmount: { toString(): string };
  }): AppointmentDto {
    return {
      id: a.id,
      clinicId: a.clinicId,
      patientId: a.patientId,
      clinicianId: a.clinicianId,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      status: a.status,
      notes: a.notes,
      feeAmount: Number(a.feeAmount),
    };
  }

  async list(
    tenantId: string,
    pageStr?: string,
    pageSizeStr?: string,
    fromStr?: string,
    toStr?: string,
    patientMrn?: string,
    statusStr?: string,
    clinicIdStr?: string,
    sortByStr?: string,
    sortOrderStr?: string
  ) {
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const sortField = pickSortField(sortByStr, ["startsAt", "endsAt", "status", "createdAt"] as const, "startsAt");
    const sortDir = parseSortOrder(sortOrderStr);

    const and: Prisma.AppointmentWhereInput[] = [{ tenantId }];

    const from = fromStr?.trim();
    const to = toStr?.trim();
    if (from && to) {
      const start = new Date(from);
      const end = new Date(to);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        and.push({ startsAt: { gte: start, lte: end } });
      }
    }

    const mrn = patientMrn?.trim();
    if (mrn) {
      and.push({ patient: { mrn: { contains: mrn, mode: "insensitive" } } });
    }

    const st = statusStr?.trim().toUpperCase();
    if (st && (Object.values(AppointmentStatus) as string[]).includes(st)) {
      and.push({ status: st as AppointmentStatus });
    }

    const clinicId = clinicIdStr?.trim();
    if (clinicId) and.push({ clinicId });

    const where: Prisma.AppointmentWhereInput = and.length > 1 ? { AND: and } : { tenantId };

    const [total, rows] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        orderBy: { [sortField]: sortDir },
        skip,
        take: pageSize,
      }),
    ]);
    return paginate(rows.map((r) => this.map(r)), total, page, pageSize);
  }

  async create(tenantId: string, dto: CreateAppointmentDto): Promise<AppointmentDto> {
    const [clinic, patient, clinician] = await Promise.all([
      this.prisma.clinic.findFirst({ where: { id: dto.clinicId, tenantId } }),
      this.prisma.patient.findFirst({ where: { id: dto.patientId, tenantId, deletedAt: null } }),
      this.prisma.user.findFirst({ where: { id: dto.clinicianId, tenantId } }),
    ]);
    if (!clinic || !patient || !clinician) throw new BadRequestException("Invalid clinic, patient, or clinician");
    const start = new Date(dto.startsAt);
    const end = new Date(dto.endsAt);
    if (end <= start) throw new BadRequestException("endsAt must be after startsAt");

    const row = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new BadRequestException("Tenant not found");
      const defaultFee = Number(tenant.appointmentDefaultFee);
      const feeRaw = dto.feeAmount !== undefined && dto.feeAmount !== null ? Number(dto.feeAmount) : defaultFee;
      const feeAmount = Number.isFinite(feeRaw) && feeRaw >= 0 ? feeRaw : defaultFee;

      const apt = await tx.appointment.create({
        data: {
          tenantId,
          clinicId: dto.clinicId,
          patientId: dto.patientId,
          clinicianId: dto.clinicianId,
          startsAt: start,
          endsAt: end,
          status: dto.status ?? AppointmentStatus.SCHEDULED,
          notes: dto.notes ?? null,
          feeAmount,
        },
      });

      if (feeAmount > 0) {
        await tx.revenueEntry.create({
          data: {
            tenantId,
            clinicId: dto.clinicId,
            appointmentId: apt.id,
            category: "APPOINTMENT_FEE",
            description: `Appointment fee · ${apt.id.slice(0, 8)}…`,
            grossAmount: feeAmount,
            taxAmount: 0,
            netAmount: feeAmount,
            currency: tenant.baseCurrency,
            postedAt: start,
            status: RevenueStatus.POSTED,
          },
        });
      }

      return apt;
    });
    return this.map(row);
  }

  async updateStatus(tenantId: string, id: string, status: AppointmentStatus): Promise<AppointmentDto> {
    const existing = await this.prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Appointment not found");
    const row = await this.prisma.appointment.update({
      where: { id },
      data: { status },
    });
    return this.map(row);
  }

  async getById(tenantId: string, id: string): Promise<AppointmentDto> {
    const row = await this.prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("Appointment not found");
    return this.map(row);
  }

  private isTerminalStatus(s: AppointmentStatus): boolean {
    return s === AppointmentStatus.COMPLETED || s === AppointmentStatus.CANCELLED;
  }

  async update(tenantId: string, id: string, dto: UpdateAppointmentDto): Promise<AppointmentDto> {
    const existing = await this.prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Appointment not found");
    if (this.isTerminalStatus(existing.status)) {
      throw new BadRequestException("This appointment is read-only (completed or cancelled)");
    }

    const nextStarts = dto.startsAt !== undefined ? new Date(dto.startsAt) : existing.startsAt;
    const nextEnds = dto.endsAt !== undefined ? new Date(dto.endsAt) : existing.endsAt;
    if (nextEnds <= nextStarts) throw new BadRequestException("endsAt must be after startsAt");

    const clinicId = dto.clinicId ?? existing.clinicId;
    const patientId = dto.patientId ?? existing.patientId;
    const clinicianId = dto.clinicianId ?? existing.clinicianId;

    if (dto.clinicId !== undefined || dto.patientId !== undefined || dto.clinicianId !== undefined) {
      const [clinic, patient, clinician] = await Promise.all([
        this.prisma.clinic.findFirst({ where: { id: clinicId, tenantId } }),
        this.prisma.patient.findFirst({ where: { id: patientId, tenantId, deletedAt: null } }),
        this.prisma.user.findFirst({ where: { id: clinicianId, tenantId } }),
      ]);
      if (!clinic || !patient || !clinician) throw new BadRequestException("Invalid clinic, patient, or clinician");
    }

    const row = await this.prisma.appointment.update({
      where: { id },
      data: {
        clinicId,
        patientId,
        clinicianId,
        startsAt: dto.startsAt !== undefined ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt !== undefined ? new Date(dto.endsAt) : undefined,
        status: dto.status !== undefined ? dto.status : undefined,
        notes: dto.notes !== undefined ? (dto.notes === "" ? null : dto.notes) : undefined,
      },
    });
    return this.map(row);
  }
}
