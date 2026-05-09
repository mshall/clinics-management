import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AppointmentStatus, EncounterStatus, Prisma, UserRole } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { pickSortField, parseSortOrder } from "../common/list-sort";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateAppointmentDto } from "./dto/create-appointment.dto";
import type { AppointmentDto } from "./dto/appointment.dto";
import type { UpdateAppointmentDto } from "./dto/update-appointment.dto";

type AppointmentRow = Prisma.AppointmentGetPayload<{
  include: {
    patient: { select: { mrn: true; firstNameEn: true; lastNameEn: true } };
    clinician: {
      select: {
        displayName: true;
        employee: { select: { firstNameEn: true; lastNameEn: true } };
      };
    };
  };
}>;

function isPhysicianRole(role: UserRole | undefined): boolean {
  return role === UserRole.PHYSICIAN || String(role) === "PHYSICIAN";
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAppointmentAccess(
    viewer: JwtUser | undefined,
    row: { clinicianId: string; clinicId: string }
  ): Promise<void> {
    if (!viewer) return;
    if (isPhysicianRole(viewer.role) && row.clinicianId !== viewer.userId) {
      throw new ForbiddenException("You can only access appointments where you are the clinician");
    }
    if (viewer.role === UserRole.CLINIC_ADMIN) {
      const ok = await this.prisma.clinicAdminScope.findFirst({
        where: { tenantId: viewer.tenantId, userId: viewer.userId, clinicId: row.clinicId },
      });
      if (!ok) {
        throw new ForbiddenException("This appointment is outside your assigned clinics");
      }
    }
  }

  private clinicianDisplayName(
    clinician: null | { displayName: string; employee: { firstNameEn: string; lastNameEn: string } | null }
  ): string | null {
    if (!clinician) return null;
    const e = clinician.employee;
    if (e) {
      const n = `${e.firstNameEn ?? ""} ${e.lastNameEn ?? ""}`.trim();
      if (n) return n;
    }
    const d = clinician.displayName?.trim();
    return d || null;
  }

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
    patient: { mrn: string; firstNameEn: string; lastNameEn: string } | null | undefined,
    clinician: { displayName: string; employee: { firstNameEn: string; lastNameEn: string } | null } | null | undefined
  ): AppointmentDto {
    const dto = {
      id: a.id,
      clinicId: a.clinicId,
      patientId: a.patientId,
      clinicianId: a.clinicianId,
      clinicianName: this.clinicianDisplayName(clinician ?? null),
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
    bookableOnlyStr?: string,
    viewer?: JwtUser
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

    if (viewer && isPhysicianRole(viewer.role)) {
      and.push({ clinicianId: viewer.userId });
    } else if (viewer?.role === UserRole.CLINIC_ADMIN) {
      const scopes = await this.prisma.clinicAdminScope.findMany({
        where: { tenantId, userId: viewer.userId },
        select: { clinicId: true },
      });
      const ids = scopes.map((s) => s.clinicId);
      if (!ids.length) {
        return paginate([], 0, page, pageSize);
      }
      and.push({ clinicId: { in: ids } });
    }

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
          clinician: {
            select: {
              displayName: true,
              employee: { select: { firstNameEn: true, lastNameEn: true } },
            },
          },
        },
      }),
    ]);
    return paginate(
      rows.map((r: AppointmentRow) => this.map(r, r.patient, r.clinician)),
      total,
      page,
      pageSize
    );
  }

  async create(tenantId: string, actor: JwtUser, dto: CreateAppointmentDto): Promise<AppointmentDto> {
    if (isPhysicianRole(actor.role) && dto.clinicianId.trim() !== actor.userId) {
      throw new BadRequestException("Physicians may only book appointments as themselves");
    }
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
        clinician: {
          select: {
            displayName: true,
            employee: { select: { firstNameEn: true, lastNameEn: true } },
          },
        },
      },
    });
    return this.map(row, row.patient, row.clinician);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: AppointmentStatus,
    viewer?: JwtUser
  ): Promise<AppointmentDto> {
    const existing = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: {
        patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } },
        clinician: {
          select: {
            displayName: true,
            employee: { select: { firstNameEn: true, lastNameEn: true } },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException("Appointment not found");
    await this.assertAppointmentAccess(viewer, existing);
    if (existing.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException("Cannot change status of a completed appointment");
    }
    const row = await this.prisma.appointment.update({
      where: { id },
      data: { status },
      include: {
        patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } },
        clinician: {
          select: {
            displayName: true,
            employee: { select: { firstNameEn: true, lastNameEn: true } },
          },
        },
      },
    });
    return this.map(row, row.patient, row.clinician);
  }

  async getById(tenantId: string, id: string, viewer?: JwtUser): Promise<AppointmentDto> {
    const row = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: {
        patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } },
        clinician: {
          select: {
            displayName: true,
            employee: { select: { firstNameEn: true, lastNameEn: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException("Appointment not found");
    await this.assertAppointmentAccess(viewer, row);
    return this.map(row, row.patient, row.clinician);
  }

  private isCompletedStatus(s: AppointmentStatus): boolean {
    return s === AppointmentStatus.COMPLETED;
  }

  async update(tenantId: string, id: string, dto: UpdateAppointmentDto, viewer?: JwtUser): Promise<AppointmentDto> {
    const existing = await this.prisma.appointment.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException("Appointment not found");
    await this.assertAppointmentAccess(viewer, existing);
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
      include: {
        patient: { select: { mrn: true, firstNameEn: true, lastNameEn: true } },
        clinician: {
          select: {
            displayName: true,
            employee: { select: { firstNameEn: true, lastNameEn: true } },
          },
        },
      },
    });
    return this.map(row, row.patient, row.clinician);
  }
}
