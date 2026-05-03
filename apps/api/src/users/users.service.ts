import { Injectable } from "@nestjs/common";
import { paginate, parsePageParams } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";

export interface UserListItemDto {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listForTenant(tenantId: string, pageStr?: string, pageSizeStr?: string) {
    const { page, pageSize, skip } = parsePageParams(pageStr, pageSizeStr);
    const where = { tenantId };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { email: "asc" },
        skip,
        take: pageSize,
        select: { id: true, email: true, displayName: true, role: true },
      }),
    ]);
    const items: UserListItemDto[] = rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.displayName,
      role: r.role,
    }));
    return paginate(items, total, page, pageSize);
  }
}
