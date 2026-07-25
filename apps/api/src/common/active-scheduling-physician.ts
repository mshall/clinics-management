import { BadRequestException } from "@nestjs/common";
import { EmployeeRecordStatus, Prisma, UserRole } from "@prisma/client";

type PhysicianDb = {
  user: {
    findFirst: (args: Prisma.UserFindFirstArgs) => Promise<{ id: string } | null>;
  };
};

/** Active physician logins eligible for appointment/encounter scheduling pickers. */
export function activeSchedulingPhysicianWhere(tenantId: string): Prisma.UserWhereInput {
  return {
    tenantId,
    role: UserRole.PHYSICIAN,
    deletedAt: null,
    deactivatedAt: null,
    AND: [
      {
        OR: [
          { employee: { is: null } },
          {
            employee: {
              is: {
                deletedAt: null,
                recordStatus: EmployeeRecordStatus.ACTIVE,
              },
            },
          },
        ],
      },
    ],
  };
}

export function activeSchedulingPhysicianAndClauses(scopeIds: string[] | null): Prisma.UserWhereInput[] {
  const and: Prisma.UserWhereInput[] = [
    {
      OR: [
        { employee: { is: null } },
        {
          employee: {
            is: {
              deletedAt: null,
              recordStatus: EmployeeRecordStatus.ACTIVE,
            },
          },
        },
      ],
    },
  ];
  if (scopeIds !== null) {
    and.push({
      OR: [{ employee: { is: null } }, { employee: { is: { clinicId: { in: scopeIds } } } }],
    });
  }
  return and;
}

export async function findActiveSchedulingPhysician(
  db: PhysicianDb,
  tenantId: string,
  userId: string,
): Promise<{ id: string } | null> {
  return db.user.findFirst({
    where: {
      id: userId.trim(),
      ...activeSchedulingPhysicianWhere(tenantId),
    },
    select: { id: true },
  });
}

export async function assertActiveSchedulingPhysician(
  db: PhysicianDb,
  tenantId: string,
  userId: string,
): Promise<void> {
  const doc = await findActiveSchedulingPhysician(db, tenantId, userId);
  if (!doc) {
    throw new BadRequestException("Selected physician is not active or is not available for scheduling");
  }
}
