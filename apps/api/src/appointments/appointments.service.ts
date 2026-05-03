import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, EncounterStatus, Prisma } from "@prisma/client";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAppointmentDto } from "./dto/create-appointment.dto";
import type { AppointmentDto } from "./dto/appointment.dto";
import type { UpdateAppointmentDto } from "./dto/update-appointment.dto";

type AppointmentRow = Prisma.AppointmentGetPayload<{
  include: { patient: { select: { mrn: true; firstNameEn: true; lastNameEn: true } } };
}>;

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(
    a: {
      id: string;
      clinicId: string;
      patientId: string;
      clinicianId: string;
      startsAt: Date;
      endsAt: Date;
      status: AppointmentStatus;
      notes: string | null;
    },
    patient?: { mrn: string; firstNameEn: string; lastNameEn: string } | null
  ): AppointmentDto {
    const dto = {
      id: a.id,
      clinicId: a.clinicId,
      patientId: a.patientId,
      clinicianId: a.clinicianId,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      status: a.status,
      notes: a.notes,
      ...(patient
        ? {
            patientMrn: patient.mrn,
            patientName: `${patient.firstNameEn} ${patient.lastNameEn}`.trim(),
          }
        : {}),
    } as AppointmentDto;
    return dto;
  }

  async list(
    tenantId: string,
    pageStr?: string,
    pageSizeStr?: string,
    fromStr?: string,
    toStr?: string,
    patientMrn?: string,
    patientSearch?: string,
    patientIdStr?: string,
    statusStr?: string,
    clinicIdStr?: string,
    sortByStr?: string,
    sortOrderStr?: string,
    bookableOnlyStr?: string
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

    const pid = patientIdStr?.trim();
    if (pid) {
      and.push({ patientId: pid });
    }

    const broad = patientSearch?.trim() ?? "";
    if (broad.length > 0) {
      and.push({
        patient: {
          is: {
            deletedAt: null,
            OR: [
              { mrn: { contains: broad, mode: "insensitive" } },
              { nationalId: { contains: broad, mode: "insensitive" } },
              { phone: { contains: broad, mode: "insensitive" } },
              { firstNameEn: { contains: broad, mode: "insensitive" } },
              { lastNameEn: { contains: broad, mode: "insensitive" } },
            ],
          },
        },
      });
    }

    const bookableOnly = bookableOnlyStr?.trim().toLowerCase() === "true" || bookableOnlyStr === "1";
    if (bookableOnly) {
      and.push({
        status: {
          in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
        },
      });
      and.push({
        encounters: {
          none: {
            status: { in: [EncounterStatus.DRAFT, EncounterStatus.AMENDED] },
          },
        },
      });
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
        include: {
          patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } },
        },
      }),
    ]);
    return paginate(
      rows.map((r: AppointmentRow) => this.map(r, r.patient)),
      total,
      page,
      pageSize
    );
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

    const row = await this.prisma.appointment.create({
      data: {
        tenantId,
        clinicId: dto.clinicId,
        patientId: dto.patientId,
        clinicianId: dto.clinicianId,
        startsAt: start,
        endsAt: end,
        status: dto.status ?? AppointmentStatus.SCHEDULED,
        notes: dto.notes ?? null,
      },
      include: {
        patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } },
      },
    });
    return this.map(row, row.patient);
  }

  async updateStatus(tenantId: string, id: string, status: AppointmentStatus): Promise<AppointmentDto> {
    const existing = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: { patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } } },
    });
    if (!existing) throw new NotFoundException("Appointment not found");
    if (existing.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException("Cannot change status of a completed appointment");
    }
    const row = await this.prisma.appointment.update({
      where: { id },
      data: { status },
      include: { patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } } },
    });
    return this.map(row, row.patient);
  }

  async getById(tenantId: string, id: string): Promise<AppointmentDto> {
    const row = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: { patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } } },
    });
    if (!row) throw new NotFoundException("Appointment not found");
    return this.map(row, row.patient);
  }

  private isCompletedStatus(s: AppointmentStatus): boolean {
    return s === AppointmentStatus.COMPLETED;
  }

  async update(tenantId: string, id: string, dto: UpdateAppointmentDto): Promise<AppointmentDto> {
    const existing = await this.prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Appointment not found");
    if (this.isCompletedStatus(existing.status)) {
      throw new BadRequestException("This appointment is read-only (completed)");
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
      include: { patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } } },
    });
    return this.map(row, row.patient);
  }
}
