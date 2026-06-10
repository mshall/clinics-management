import type { UserRole } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

export type OrgHierarchyNodeType = "platform" | "organization" | "clinic" | "users_group" | "user";

export type OrgHierarchyNode = {
  id: string;
  nodeType: OrgHierarchyNodeType;
  label: string;
  subtitle?: string;
  counts?: {
    organizations?: number;
    users?: number;
    clinics?: number;
    patients?: number;
    branches?: number;
  };
  meta?: {
    role?: UserRole;
    kind?: "parent" | "branch" | "standalone";
    email?: string;
    city?: string;
    currency?: string;
  };
  children: OrgHierarchyNode[];
};

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  clinicAdminScopes: { clinicId: string }[];
  employee: { clinicId: string } | null;
};

type ClinicRow = {
  id: string;
  nameEn: string;
  parentClinicId: string | null;
  city: string;
  phone: string;
};

function userNode(u: UserRow): OrgHierarchyNode {
  return {
    id: u.id,
    nodeType: "user",
    label: u.displayName,
    subtitle: u.email,
    meta: { role: u.role, email: u.email },
    children: [],
  };
}

function clinicIdsForUser(u: UserRow): Set<string> {
  const ids = new Set<string>();
  for (const s of u.clinicAdminScopes) ids.add(s.clinicId);
  if (u.employee?.clinicId) ids.add(u.employee.clinicId);
  return ids;
}

async function expandClinicScope(prisma: PrismaService, tenantId: string, scopeIds: string[]): Promise<Set<string>> {
  if (!scopeIds.length) return new Set();
  const all = await prisma.clinic.findMany({
    where: { tenantId },
    select: { id: true, parentClinicId: true },
  });
  const out = new Set(scopeIds);
  for (const id of scopeIds) {
    const row = all.find((c) => c.id === id);
    if (row?.parentClinicId) out.add(row.parentClinicId);
    for (const c of all) {
      if (c.parentClinicId === id) out.add(c.id);
    }
  }
  return out;
}

export async function buildTenantHierarchy(
  prisma: PrismaService,
  tenantId: string,
  visibleClinicIds?: Set<string> | null,
): Promise<OrgHierarchyNode> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      baseCurrency: true,
      _count: { select: { users: true, clinics: true, patients: true } },
    },
  });
  if (!tenant) throw new Error("Organization not found");

  const [clinics, users] = await Promise.all([
    prisma.clinic.findMany({
      where: { tenantId },
      orderBy: [{ parentClinicId: "asc" }, { nameEn: "asc" }],
      select: { id: true, nameEn: true, parentClinicId: true, city: true, phone: true },
    }),
    prisma.user.findMany({
      where: { tenantId },
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        clinicAdminScopes: { select: { clinicId: true } },
        employee: { select: { clinicId: true } },
      },
    }),
  ]);

  const filteredClinics = visibleClinicIds
    ? clinics.filter((c) => visibleClinicIds.has(c.id))
    : clinics;

  const visibleClinicSet = new Set(filteredClinics.map((c) => c.id));

  const parentClinicRows = filteredClinics.filter((c) => !c.parentClinicId);
  const defaultHqId = parentClinicRows[0]?.id ?? null;

  const usersByClinic = new Map<string, UserRow[]>();

  for (const u of users) {
    let assigned = [...clinicIdsForUser(u)].filter((cid) => !visibleClinicIds || visibleClinicSet.has(cid));
    if (!assigned.length && defaultHqId && (!visibleClinicIds || visibleClinicSet.has(defaultHqId))) {
      assigned = [defaultHqId];
    }
    if (!assigned.length) continue;
    for (const cid of assigned) {
      const list = usersByClinic.get(cid) ?? [];
      if (!list.some((x) => x.id === u.id)) list.push(u);
      usersByClinic.set(cid, list);
    }
  }

  const branchesByParent = new Map<string, ClinicRow[]>();
  for (const c of filteredClinics) {
    if (c.parentClinicId && visibleClinicSet.has(c.parentClinicId)) {
      const list = branchesByParent.get(c.parentClinicId) ?? [];
      list.push(c);
      branchesByParent.set(c.parentClinicId, list);
    }
  }

  const orphanBranches = filteredClinics.filter(
    (c) => c.parentClinicId && !visibleClinicSet.has(c.parentClinicId),
  );

  function buildClinicNode(c: ClinicRow, role: "parent" | "standalone" | "branch"): OrgHierarchyNode {
    const branches = role !== "branch" ? (branchesByParent.get(c.id) ?? []) : [];
    const clinicUsers = usersByClinic.get(c.id) ?? [];
    const children: OrgHierarchyNode[] = [
      ...branches.map((b) => buildClinicNode(b, "branch")),
      ...clinicUsers.map(userNode),
    ];
    return {
      id: c.id,
      nodeType: "clinic",
      label: c.nameEn,
      subtitle: c.city,
      meta: { kind: role, city: c.city },
      counts: { users: clinicUsers.length, branches: branches.length },
      children,
    };
  }

  const clinicChildren = [
    ...parentClinicRows.map((c) => {
      const branchCount = (branchesByParent.get(c.id) ?? []).length;
      return buildClinicNode(c, branchCount > 0 ? "parent" : "standalone");
    }),
    ...orphanBranches.map((c) => buildClinicNode(c, "branch")),
  ];

  const visibleUserCount = [...usersByClinic.values()].reduce((n, list) => n + list.length, 0);

  return {
    id: tenant.id,
    nodeType: "organization",
    label: tenant.name,
    subtitle: tenant.baseCurrency,
    meta: { currency: tenant.baseCurrency },
    counts: {
      users: visibleClinicIds ? visibleUserCount : tenant._count.users,
      clinics: visibleClinicIds ? filteredClinics.length : tenant._count.clinics,
      patients: tenant._count.patients,
    },
    children: clinicChildren,
  };
}

export async function buildPlatformHierarchy(prisma: PrismaService, tenantIdFilter?: string): Promise<OrgHierarchyNode> {
  if (tenantIdFilter?.trim()) {
    return buildTenantHierarchy(prisma, tenantIdFilter.trim());
  }

  const tenants = await prisma.tenant.findMany({
    orderBy: { name: "asc" },
    select: { id: true },
  });

  const children = await Promise.all(tenants.map((t) => buildTenantHierarchy(prisma, t.id)));

  return {
    id: "platform",
    nodeType: "platform",
    label: "Platform",
    counts: { organizations: tenants.length },
    children,
  };
}

export async function resolveVisibleClinicIds(
  prisma: PrismaService,
  tenantId: string,
  scopeIds: string[] | null,
): Promise<Set<string> | null> {
  if (!scopeIds) return null;
  return expandClinicScope(prisma, tenantId, scopeIds);
}
