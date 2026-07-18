import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import * as path from "path";
import type { Readable } from "stream";
import { isPlatformSuperAdmin } from "../common/platform-super-admin";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantRoleNavTabsService } from "../user-nav-tabs/tenant-role-nav-tabs.service";
import { UPLOAD_BLOB_STORAGE, type UploadBlobStorage } from "../storage/upload-blob.storage";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type AvatarFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

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
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly tenantRoleNav: TenantRoleNavTabsService,
    @Inject(UPLOAD_BLOB_STORAGE) private readonly uploads: UploadBlobStorage,
  ) {}

  private async navTabKeysForUser(tenantId: string, userId: string): Promise<string[] | null> {
    const row = await this.prisma.userNavTabGrant.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!row) return null;
    const arr = Array.isArray(row.tabKeys) ? (row.tabKeys as unknown[]).map((x) => String(x)) : [];
    return arr.length ? arr : null;
  }

  private mapAuthUser(user: {
    id: string;
    tenantId: string | null;
    email: string;
    displayName: string;
    role: UserRole;
    avatarRelativePath?: string | null;
  }, navTabKeys: string[] | null, roleNavTabKeys: string[] | null) {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      navTabKeys,
      roleNavTabKeys,
      platformSuperAdmin: isPlatformSuperAdmin({
        email: user.email,
        role: user.role,
      }),
      hasAvatar: Boolean(user.avatarRelativePath),
    };
  }

  async login(email: string, password: string) {
    const normalized = normalizeLoginEmail(email);
    const variants = loginEmailLookupVariants(normalized);
    const candidates = await this.prisma.user.findMany({
      where: {
        email: { in: variants },
        deletedAt: null,
        deactivatedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        displayName: true,
        role: true,
        passwordHash: true,
        avatarRelativePath: true,
        deletedAt: true,
        deactivatedAt: true,
      },
    });
    const user = candidates.find((u) => passwordMatches(password, u.passwordHash));
    if (!user) throw new UnauthorizedException("Invalid credentials");
    if (user.deletedAt || user.deactivatedAt) {
      throw new UnauthorizedException("This account is deactivated or archived");
    }

    const accessToken = this.jwt.sign({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });

    const navTabKeys =
      user.tenantId != null ? await this.navTabKeysForUser(user.tenantId, user.id) : null;
    const roleNavTabKeys =
      user.tenantId != null ? await this.tenantRoleNav.roleNavTabKeysForTenantUser(user.tenantId, user.role) : null;

    void this.audit.recordLogin(user, user.email);

    return {
      accessToken,
      user: this.mapAuthUser(user, navTabKeys, roleNavTabKeys),
    };
  }

  async changePassword(
    userId: string,
    tenantId: string | null,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: tenantId != null ? { id: userId, tenantId } : { id: userId, tenantId: null },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException();
    if (!passwordMatches(currentPassword, user.passwordHash)) {
      throw new BadRequestException("Current password is incorrect");
    }
    if (passwordMatches(newPassword, user.passwordHash)) {
      throw new BadRequestException("New password must be different from the current password");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: bcrypt.hashSync(newPassword, 10) },
    });
    return { ok: true as const };
  }

  async me(userId: string, tenantId: string | null) {
    const user = await this.prisma.user.findFirst({
      where: tenantId != null ? { id: userId, tenantId } : { id: userId, tenantId: null },
    });
    if (!user) throw new UnauthorizedException();
    const navTabKeys =
      user.tenantId != null ? await this.navTabKeysForUser(user.tenantId, userId) : null;
    const roleNavTabKeys =
      user.tenantId != null ? await this.tenantRoleNav.roleNavTabKeysForTenantUser(user.tenantId, user.role) : null;
    return this.mapAuthUser(user, navTabKeys, roleNavTabKeys);
  }

  async attachMyAvatar(
    userId: string,
    tenantId: string | null,
    file?: AvatarFile,
  ): Promise<{ ok: true; hasAvatar: true }> {
    const user = await this.prisma.user.findFirst({
      where: tenantId != null ? { id: userId, tenantId } : { id: userId, tenantId: null },
      select: { id: true, tenantId: true, avatarRelativePath: true },
    });
    if (!user) throw new UnauthorizedException();
    if (!file?.buffer?.length) throw new BadRequestException("File is required");
    if (file.size > MAX_AVATAR_BYTES) throw new BadRequestException("File too large (max 5MB)");
    const mime = file.mimetype || "application/octet-stream";
    if (!ALLOWED_AVATAR_MIME.has(mime)) throw new BadRequestException(`Unsupported file type: ${mime}`);

    const scope = user.tenantId ?? "platform";
    const docId = randomUUID();
    const base = path.basename(file.originalname || "avatar").replace(/[^\w.\-]+/g, "_").slice(0, 80) || "avatar";
    const relativePath = `${scope}/${user.id}/${docId}-${base}`;
    await this.uploads.put("users", relativePath, file.buffer, mime);

    if (user.avatarRelativePath) {
      await this.uploads.deleteObject("users", user.avatarRelativePath).catch(() => undefined);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarRelativePath: relativePath, avatarMimeType: mime },
    });
    return { ok: true, hasAvatar: true };
  }

  async getMyAvatarMeta(userId: string, tenantId: string | null): Promise<{ mimeType: string; storageKey: string }> {
    const user = await this.prisma.user.findFirst({
      where: tenantId != null ? { id: userId, tenantId } : { id: userId, tenantId: null },
      select: { avatarRelativePath: true, avatarMimeType: true },
    });
    if (!user?.avatarRelativePath) throw new NotFoundException("Avatar not found");
    return {
      mimeType: user.avatarMimeType || "image/jpeg",
      storageKey: user.avatarRelativePath,
    };
  }

  async openAvatarReadStream(storageKey: string): Promise<Readable> {
    return this.uploads.getReadStream("users", storageKey);
  }

  async removeMyAvatar(userId: string, tenantId: string | null): Promise<{ ok: true; hasAvatar: false }> {
    const user = await this.prisma.user.findFirst({
      where: tenantId != null ? { id: userId, tenantId } : { id: userId, tenantId: null },
      select: { id: true, avatarRelativePath: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.avatarRelativePath) {
      await this.uploads.deleteObject("users", user.avatarRelativePath).catch(() => undefined);
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarRelativePath: null, avatarMimeType: null },
    });
    return { ok: true, hasAvatar: false };
  }
}
