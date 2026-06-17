import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { PrismaService } from "../prisma/prisma.service";

function normalizeLoginEmail(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

/** Same mailbox on old demo domain vs current product domain (DB may still store either). */
function loginEmailLookupVariants(normalized: string): string[] {
  const out = new Set<string>([normalized]);
  if (normalized.endsWith("@kiorly.com")) {
    out.add(`${normalized.slice(0, -"@kiorly.com".length)}@demo.clinic`);
  }
  if (normalized.endsWith("@demo.clinic")) {
    out.add(`${normalized.slice(0, -"@demo.clinic".length)}@kiorly.com`);
  }
  return [...out];
}

function passwordMatches(password: string, passwordHash: string | null | undefined): boolean {
  if (!passwordHash) return false;
  try {
    return bcrypt.compareSync(password, passwordHash);
  } catch {
    return false;
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  private async navTabKeysForUser(tenantId: string, userId: string): Promise<string[] | null> {
    const row = await this.prisma.userNavTabGrant.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!row) return null;
    const arr = Array.isArray(row.tabKeys) ? (row.tabKeys as unknown[]).map((x) => String(x)) : [];
    return arr.length ? arr : null;
  }

  async login(email: string, password: string) {
    const normalized = normalizeLoginEmail(email);
    const variants = loginEmailLookupVariants(normalized);
    const candidates = await this.prisma.user.findMany({
      where: { email: { in: variants } },
      select: {
        id: true,
        tenantId: true,
        email: true,
        displayName: true,
        role: true,
        passwordHash: true,
      },
    });
    const user = candidates.find((u) => passwordMatches(password, u.passwordHash));
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const accessToken = this.jwt.sign({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });

    const navTabKeys =
      user.tenantId != null ? await this.navTabKeysForUser(user.tenantId, user.id) : null;

    const platformSuperAdmin = isPlatformSuperAdmin({
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        navTabKeys,
        platformSuperAdmin,
      },
    };
  }

  async me(userId: string, tenantId: string | null) {
    const user = await this.prisma.user.findFirst({
      where: tenantId != null ? { id: userId, tenantId } : { id: userId, tenantId: null },
    });
    if (!user) throw new UnauthorizedException();
    const navTabKeys =
      user.tenantId != null ? await this.navTabKeysForUser(user.tenantId, userId) : null;
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      navTabKeys,
      platformSuperAdmin: isPlatformSuperAdmin({
        email: user.email,
        role: user.role,
      }),
    };
  }
}
