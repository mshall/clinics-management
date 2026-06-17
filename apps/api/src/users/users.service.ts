import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";

export interface UserListItemDto {
  id: string;
  email: string;
  displayName: string;
  role: string;
  createdAt?: string;
  clinicIds?: string[];
  clinics?: { id: string; nameEn: string }[];
}

function mapUserClinicAssignments(
  scopes: { clinicId: string; clinic: { id: string; nameEn: string } }[],
  employee: { clinicId: string; clinic: { id: string; nameEn: string } } | null,
): { clinicIds: string[]; clinics: { id: string; nameEn: string }[] } {
  const byId = new Map<string, { id: string; nameEn: string }>();
  for (const s of scopes) byId.set(s.clinic.id, s.clinic);
  if (employee?.clinic && !byId.has(employee.clinic.id)) {
    byId.set(employee.clinic.id, employee.clinic);
  }
  const clinics = [...byId.values()];
  return { clinicIds: clinics.map((c) => c.id), clinics };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTenant(tenantId: string, pageStr?: string, pageSizeStr?: string, qRaw?: string) {
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const q = qRaw?.trim() ?? "";
    const where: Prisma.UserWhereInput = {
      tenantId,
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { displayName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { email: "asc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          createdAt: true,
          clinicAdminScopes: { include: { clinic: { select: { id: true, nameEn: true } } } },
          employee: { include: { clinic: { select: { id: true, nameEn: true } } } },
        },
      }),
    ]);
    const items: UserListItemDto[] = rows.map((r) => {
      const clinics = mapUserClinicAssignments(r.clinicAdminScopes, r.employee);
      return {
        id: r.id,
        email: r.email,
        displayName: r.displayName,
        role: r.role,
        createdAt: r.createdAt.toISOString(),
        ...clinics,
      };
    });
    return paginate(items, total, page, pageSize);
  }
}
