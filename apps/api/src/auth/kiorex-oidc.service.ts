import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { passwordHasher } from "./password-hasher";
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify } from "jose";
import { AuditService } from "../audit/audit.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags-public";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService, type LoginSessionMeta } from "./auth.service";
import {
  createOpenIdClientPort,
  readKiorexOidcConfig,
  type KiorexOidcPort,
} from "./kiorex-oidc.port";

const TXN_TTL_MS = 10 * 60 * 1000;
const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";
const KX_SUBJECT_DELETED = "https://schemas.kiorex.com/event/subject.deleted";
const SSO_FLAG = "account.provider_sso";

export type KiorexCallbackResult =
  | { status: "SESSION"; session: Awaited<ReturnType<AuthService["issueSsoSession"]>>; /** Passport RP-initiated logout URL (id_token_hint): the web app navigates here on sign-out so Passport does not stay signed in. */ endSessionUrl?: string }
  | { status: "MFA_REQUIRED"; ticket: string; mfaWhatsApp: boolean }
  | { status: "LINK_REQUIRED" }
  | { status: "LINKED" };

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

@Injectable()
export class KiorexOidcService {
  private readonly log = new Logger(KiorexOidcService.name);
  private portPromise: Promise<KiorexOidcPort> | null = null;
  private portOverride: KiorexOidcPort | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /** Test seam. */
  setPortForTests(port: KiorexOidcPort | null): void {
    this.portOverride = port;
  }

  /** `KIOREX_OIDC_ISSUER` unset ⇒ disabled, button hidden, no behaviour change. */
  isConfigured(): boolean {
    return this.portOverride != null || readKiorexOidcConfig() != null;
  }

  async isEnabled(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    // account.provider_sso OFF (global) ⇒ providers use product login.
    return this.flags.isEnabledForUser(null, SSO_FLAG);
  }

  private async port(): Promise<KiorexOidcPort> {
    if (this.portOverride) return this.portOverride;
    const cfg = readKiorexOidcConfig();
    if (!cfg) throw new NotFoundException("Sign in with Kiorex Passport is not configured");
    this.portPromise ??= createOpenIdClientPort(cfg).catch((e) => {
      this.portPromise = null;
      throw e;
    });
    return this.portPromise;
  }

  /** Redirect URI for an edition (NURSE => nurse.kiorly.com). Null = the port default (Clinic). Never changes the client or audience. */
  private redirectUriFor(edition: string | null | undefined): string | undefined {
    if (edition !== "NURSE") return undefined;
    return readKiorexOidcConfig()?.nurseRedirectUri;
  }

  private async begin(mode: "LOGIN" | "LINK", userId?: string, edition?: "CLINIC" | "NURSE"): Promise<{ authorizationUrl: string }> {
    if (!(await this.isEnabled())) throw new NotFoundException("Sign in with Kiorex Passport is not available");
    const port = await this.port();
    const state = b64url(randomBytes(24));
    const nonce = b64url(randomBytes(24));
    const codeVerifier = b64url(randomBytes(48));
    const codeChallenge = b64url(createHash("sha256").update(codeVerifier).digest());
    await this.prisma.kiorexOidcTransaction.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.prisma.kiorexOidcTransaction.create({
      data: { state, nonce, codeVerifier, mode, userId: userId ?? null, edition: edition ?? null, expiresAt: new Date(Date.now() + TXN_TTL_MS) },
    });
    return { authorizationUrl: port.authorizationUrl({ state, nonce, codeChallenge, redirectUri: this.redirectUriFor(edition) }) };
  }

  startLogin(edition?: "CLINIC" | "NURSE") {
    return this.begin("LOGIN", undefined, edition);
  }

  /** Link flow step 1: the signed-in Kiorly user re-authenticates with their existing password. */
  async startLink(userId: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, deactivatedAt: null },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash || !password || !(await passwordHasher.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Password confirmation failed");
    }
    const existing = await this.prisma.kiorexIdentityLink.findUnique({ where: { userId } });
    if (existing) throw new ConflictException("This account is already linked to a Kiorex Passport");
    return this.begin("LINK", userId);
  }

  async linkStatus(userId: string) {
    const link = await this.prisma.kiorexIdentityLink.findUnique({ where: { userId } });
    return { enabled: await this.isEnabled(), linked: link != null, linkedAt: link?.linkedAt ?? null };
  }

  async unlink(userId: string, password: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId }, select: { passwordHash: true, tenantId: true } });
    if (!user?.passwordHash || !(await passwordHasher.compare(password ?? "", user.passwordHash))) {
      throw new UnauthorizedException("Password confirmation failed");
    }
    const link = await this.prisma.kiorexIdentityLink.findUnique({ where: { userId } });
    if (!link) return { linked: false };
    await this.prisma.kiorexIdentityLink.delete({ where: { userId } });
    await this.auditLink(user.tenantId, userId, "KIOREX_IDENTITY_UNLINKED", { subject: link.subject });
    return { linked: false };
  }

  async handleCallback(
    input: { code?: string; state?: string; iss?: string },
    meta: LoginSessionMeta,
  ): Promise<KiorexCallbackResult> {
    const { code, state } = input;
    if (!code || !state) throw new BadRequestException("code and state are required");
    // Single use: consume the transaction before anything else.
    const txn = await this.prisma.kiorexOidcTransaction.findUnique({ where: { state } });
    if (!txn || txn.mode === "MFA_TICKET") throw new UnauthorizedException("Unknown or expired sign-in transaction");
    await this.prisma.kiorexOidcTransaction.delete({ where: { state } }).catch(() => undefined);
    if (txn.expiresAt.getTime() < Date.now()) throw new UnauthorizedException("Sign-in transaction expired");

    const port = await this.port();
    let claims;
    try {
      claims = await port.exchange({ code, state, iss: input.iss }, { state, nonce: txn.nonce, codeVerifier: txn.codeVerifier }, { redirectUri: this.redirectUriFor(txn.edition) });
    } catch (e) {
      this.log.warn(`Kiorex Passport code exchange failed: ${e instanceof Error ? e.message : String(e)}`);
      throw new UnauthorizedException("Kiorex Passport sign-in failed");
    }

    if (txn.mode === "LINK") return this.completeLink(txn.userId, port.issuer, claims);

    const link = await this.prisma.kiorexIdentityLink.findUnique({
      where: { issuer_subject: { issuer: port.issuer, subject: claims.sub } },
    });
    // Never auto-merge or auto-create: an unlinked subject must link explicitly from a signed-in session.
    if (!link) return { status: "LINK_REQUIRED" };
    return this.finishLogin(link.userId, claims.sid, undefined, meta, state, this.endSessionUrlFor(port, claims.idToken, txn.edition));
  }

  /** Where the web app sends the browser on sign-out. Only the registered post-logout URI (the web root) is ever requested. */
  private endSessionUrlFor(port: KiorexOidcPort, idToken: string | undefined, edition: string | null | undefined): string | undefined {
    if (!idToken || !port.endSessionUrl) return undefined;
    // Clinic edition: the web root is the registered post-logout URI. Nurse edition has no registered local one, so Passport shows its own signed-out page.
    const web = edition === "NURSE" ? undefined : readKiorexOidcConfig()?.redirectUri;
    return port.endSessionUrl({ idTokenHint: idToken, postLogoutRedirectUri: web ? `${new URL(web).origin}/` : undefined });
  }

  private async completeLink(
    userId: string | null,
    issuer: string,
    claims: { sub: string; phone_number_verified?: boolean },
  ): Promise<KiorexCallbackResult> {
    if (!userId) throw new UnauthorizedException("Link transaction has no user");
    const taken = await this.prisma.kiorexIdentityLink.findUnique({
      where: { issuer_subject: { issuer, subject: claims.sub } },
    });
    if (taken) throw new ConflictException("This Kiorex Passport is already linked to another Kiorly user");
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { tenantId: true } });
    if (!user) throw new UnauthorizedException("User not found");
    await this.prisma.kiorexIdentityLink.create({
      data: {
        userId,
        issuer,
        subject: claims.sub,
        linkedVia: "PASSWORD_REAUTH",
        phoneVerified: claims.phone_number_verified === true,
      },
    });
    await this.auditLink(user.tenantId, userId, "KIOREX_IDENTITY_LINKED", {
      subject: claims.sub,
      linkedVia: "PASSWORD_REAUTH",
      phoneVerified: claims.phone_number_verified === true,
    });
    return { status: "LINKED" };
  }

  private async finishLogin(
    userId: string,
    sid: string | undefined,
    mfaCode: string | undefined,
    meta: LoginSessionMeta,
    ticketState?: string,
    endSessionUrl?: string,
  ): Promise<KiorexCallbackResult> {
    try {
      const session = await this.auth.issueSsoSession(userId, mfaCode, meta);
      if (sid) {
        await this.prisma.userSession.update({ where: { id: session.sessionId }, data: { kiorexSid: sid } });
      }
      return { status: "SESSION", session, ...(endSessionUrl ? { endSessionUrl } : {}) };
    } catch (e) {
      const body = (e as { getResponse?: () => unknown }).getResponse?.() as
        | { errorCode?: string; mfaWhatsApp?: boolean }
        | undefined;
      if (body?.errorCode === "MFA_REQUIRED" && ticketState) {
        // A Kiorex session alone never replaces TOTP step-up (SC-04): hold the verified identity behind a ticket.
        await this.prisma.kiorexOidcTransaction.create({
          data: {
            state: ticketState,
            nonce: "-",
            // MFA_TICKET rows never use the PKCE verifier: the (5-minute) ticket carries the logout URL to the second step instead
            codeVerifier: endSessionUrl ?? "-",
            mode: "MFA_TICKET",
            userId,
            sid: sid ?? null,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          },
        });
        return { status: "MFA_REQUIRED", ticket: ticketState, mfaWhatsApp: Boolean(body.mfaWhatsApp) };
      }
      throw e;
    }
  }

  async completeWithMfa(ticket: string, mfaCode: string, meta: LoginSessionMeta): Promise<KiorexCallbackResult> {
    const txn = await this.prisma.kiorexOidcTransaction.findUnique({ where: { state: ticket } });
    if (!txn || txn.mode !== "MFA_TICKET" || !txn.userId || txn.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Unknown or expired sign-in ticket");
    }
    const res = await this.finishLogin(txn.userId, txn.sid ?? undefined, mfaCode, meta, undefined, txn.codeVerifier.startsWith("http") ? txn.codeVerifier : undefined);
    if (res.status === "SESSION") await this.prisma.kiorexOidcTransaction.delete({ where: { state: ticket } }).catch(() => undefined);
    return res;
  }

  /**
   * OIDC Back-Channel Logout 1.0: verify the signed logout_token (jose), then revoke Kiorly sessions bound to `sid`
   * (or every session of the linked user when only `sub` is present / the subject was deleted).
   */
  async backchannelLogout(logoutToken: unknown): Promise<{ revoked: number }> {
    if (typeof logoutToken !== "string" || !logoutToken) throw new BadRequestException("missing logout_token");
    if (!this.isConfigured()) throw new NotFoundException("Sign in with Kiorex Passport is not configured");
    const port = await this.port();
    let payload;
    try {
      ({ payload } = await jwtVerify(logoutToken, port.logoutKeys(), {
        issuer: port.issuer,
        audience: port.clientId,
        algorithms: ["RS256"],
        typ: "logout+jwt",
        clockTolerance: 5,
      }));
    } catch (e) {
      throw new BadRequestException(`invalid logout token: ${e instanceof Error ? e.message : String(e)}`);
    }
    const events = payload.events as Record<string, unknown> | undefined;
    if (!events || typeof events !== "object" || !(BACKCHANNEL_EVENT in events)) {
      throw new BadRequestException("missing backchannel-logout event");
    }
    if ("nonce" in payload) throw new BadRequestException("logout token must not contain nonce");
    const sub = typeof payload.sub === "string" ? payload.sub : undefined;
    const sid = typeof payload.sid === "string" ? payload.sid : undefined;
    const jti = typeof payload.jti === "string" ? payload.jti : undefined;
    if (!sub && !sid) throw new BadRequestException("logout token needs sub or sid");
    if (!jti) throw new BadRequestException("logout token needs jti");
    // replay cache in Postgres: shared by every API instance (an in-memory map accepted a replay that landed on another instance)
    const now = Date.now();
    try {
      await this.prisma.kiorexLogoutTokenSeen.create({ data: { jti, expiresAt: new Date(Math.max(((payload.exp ?? 0) as number) * 1000 || now + 120_000, now) + 5 * 60_000) } });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw new BadRequestException("logout token replayed");
      throw e;
    }
    void this.prisma.kiorexLogoutTokenSeen.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => undefined);

    const subjectDeleted = KX_SUBJECT_DELETED in events;
    const revokedAt = new Date();
    let revoked = 0;
    if (sid && !subjectDeleted) {
      revoked = (await this.prisma.userSession.updateMany({ where: { kiorexSid: sid, revokedAt: null }, data: { revokedAt } })).count;
    } else if (sub) {
      const link = await this.prisma.kiorexIdentityLink.findUnique({
        where: { issuer_subject: { issuer: port.issuer, subject: sub } },
        include: { user: { select: { tenantId: true } } },
      });
      if (link) {
        revoked = (await this.prisma.userSession.updateMany({ where: { userId: link.userId, revokedAt: null }, data: { revokedAt } })).count;
        if (subjectDeleted) {
          await this.prisma.kiorexIdentityLink.delete({ where: { userId: link.userId } });
          await this.auditLink(link.user.tenantId, link.userId, "KIOREX_IDENTITY_SUBJECT_DELETED", { subject: sub });
        }
      }
    }
    return { revoked };
  }

  private async auditLink(tenantId: string | null, userId: string, action: string, metadata: Record<string, unknown>) {
    if (!tenantId) return;
    await this.audit.recordEvent({ tenantId, actorId: userId, clinicId: null, action, resource: "Auth", resourceId: userId, metadata });
  }
}
