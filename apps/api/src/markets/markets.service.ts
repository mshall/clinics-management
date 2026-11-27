import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { MarketLaunchStatus, MarketOperationalStatus, Prisma } from "@prisma/client";
import type { JwtUser } from "../auth/jwt-user";
import { PrismaService } from "../prisma/prisma.service";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { effectiveOperationalStatus, marketAcceptsNewTenants, marketOperabilityLabel } from "./market-operational";
import {
  assertSubProcessorAllowedForFeatureFlag,
  daysUntilCrossBorderExpiry,
  hasCrossBorderLaunchApproval,
  marketRequiresCrossBorderApproval,
  readLegalConfig,
} from "./market-legal-guards";
import {
  assertLiveMarketHasCrossBorderApproval,
  assertLiveMarketHasTaxPack,
  assertMarketReadyForCrossBorderLaunch,
} from "./market-pack-validation";
import { assertMarketMatchesProductionBinding, getDeploymentCell } from "./data-cells";
import { MarketProvisionService } from "./market-provision.service";
import type { PatchMarketDto } from "./dto/patch-market.dto";
import { type MarketActor, actorFromJwt } from "./market-actor";
import { normalizeMarketCreate } from "./market-country-defaults";
import { type TransitionInput, parseTransitionInput } from "./market-transition-input";
import { parseMarketTaxPack } from "./market-tax-pack";

export type CreateMarketDto = {
  code: string;
  nameEn: string;
  nameAr?: string;
  defaultCurrency?: string;
  defaultTimezone?: string;
  defaultLocale?: string;
  defaultPhoneRegion?: string;
  weekendDays?: number[];
  enabledLanguages?: string[];
  dataRegion?: string;
  hostCell?: string;
  taxConfig?: Record<string, unknown>;
  paymentMethods?: unknown[];
  reason?: string;
};

export type MarketTransition = "LAUNCH" | "PAUSE" | "DISABLE" | "ENABLE";

export type MarketRow = Prisma.MarketGetPayload<{ include: { _count: { select: { tenants: true } } } }>;

@Injectable()
export class MarketsService {
  private readonly log = new Logger(MarketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly provision: MarketProvisionService,
  ) {}

  // ───────────── reads ─────────────

  async refreshExpiredPauses(): Promise<number> {
    const result = await this.prisma.market.updateMany({
      where: {
        operationalStatus: MarketOperationalStatus.PAUSED,
        pausedUntil: { lte: new Date() },
      },
      data: { operationalStatus: MarketOperationalStatus.ACTIVE, pausedUntil: null },
    });
    return result.count;
  }

  async list(user: JwtUser) {
    actorFromJwt(user);
    return this.listAll();
  }

  async listAll() {
    await this.refreshExpiredPauses();
    const rows = await this.prisma.market.findMany({ orderBy: { code: "asc" }, include: { _count: { select: { tenants: true } } } });
    return rows.map((m) => this.mapMarket(m));
  }

  async listOperable(user: JwtUser) {
    actorFromJwt(user);
    return this.listOperableForOnboarding();
  }

  async listOperableForOnboarding(): Promise<
    Array<{ id: string; code: string; nameEn: string; defaultCurrency: string; hostCell: string }>
  > {
    await this.refreshExpiredPauses();
    const rows = await this.prisma.market.findMany({
      where: { status: MarketLaunchStatus.LIVE },
      orderBy: { code: "asc" },
    });
    return rows
      .filter((m) => marketAcceptsNewTenants(m))
      .map((m) => ({
        id: m.id,
        code: m.code,
        nameEn: m.nameEn,
        defaultCurrency: m.defaultCurrency,
        hostCell: m.hostCell,
      }));
  }

  async get(user: JwtUser, id: string) {
    actorFromJwt(user);
    return this.getOne(id);
  }

  async getOne(id: string) {
    await this.refreshExpiredPauses();
    const row = await this.loadRow(id);
    return this.mapMarket(row);
  }

  private async loadRow(id: string): Promise<MarketRow> {
    const row = await this.prisma.market.findFirst({ where: { id }, include: { _count: { select: { tenants: true } } } });
    if (!row) throw new NotFoundException({ code: "MARKET_NOT_FOUND", message: "Market not found" });
    return row;
  }

  async assertMarketForNewTenant(marketId: string) {
    await this.refreshExpiredPauses();
    const row = await this.prisma.market.findFirst({ where: { id: marketId } });
    if (!row) throw new BadRequestException("Market not found");
    if (!marketAcceptsNewTenants(row)) {
      const op = marketOperabilityLabel(row);
      throw new BadRequestException(`Market is not accepting new organizations (${op})`);
    }
    assertLiveMarketHasTaxPack(row);
    assertLiveMarketHasCrossBorderApproval(row);
    return row;
  }

  async auditTrail(marketId: string, opts: { limit?: number; before?: string } = {}) {
    await this.loadRow(marketId);
    const asked = Math.floor(Number(opts.limit ?? 50));
    const limit = Number.isFinite(asked) && asked >= 1 ? Math.min(200, asked) : 50;
    const before = opts.before ? new Date(opts.before) : null;
    const rows = await this.prisma.marketAuditEvent.findMany({
      where: { marketId, ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      nextBefore: rows.length > limit ? page[page.length - 1]!.createdAt.toISOString() : null,
    };
  }

  async listChangeRequests(marketId: string, status?: string) {
    await this.loadRow(marketId);
    const rows = await this.prisma.marketChangeRequest.findMany({
      where: { marketId, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null }));
  }

  // ───────────── create / patch / delete ─────────────

  async create(user: JwtUser, dto: CreateMarketDto) {
    return this.createAs(actorFromJwt(user), dto);
  }

  async createAs(actor: MarketActor, dto: CreateMarketDto) {
    const { value, issues } = normalizeMarketCreate(dto);
    if (!value) throw new BadRequestException({ code: "MARKET_INVALID", message: issues.map((i) => i.message).join("; "), issues });
    const reason = dto.reason?.trim() || "Country launch initiated";
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.market.create({
          data: {
            code: value.code,
            nameEn: value.nameEn,
            nameAr: value.nameAr,
            status: MarketLaunchStatus.DRAFT,
            defaultCurrency: value.defaultCurrency,
            defaultTimezone: value.defaultTimezone,
            defaultLocale: value.defaultLocale,
            defaultPhoneRegion: value.defaultPhoneRegion,
            weekendDays: value.weekendDays as Prisma.InputJsonValue,
            enabledLanguages: value.enabledLanguages as Prisma.InputJsonValue,
            dataRegion: value.dataRegion,
            hostCell: value.hostCell,
            taxConfig: (dto.taxConfig ?? {}) as Prisma.InputJsonValue,
            paymentMethods: (dto.paymentMethods ?? []) as Prisma.InputJsonValue,
          },
          include: { _count: { select: { tenants: true } } },
        });
        await this.writeAudit(tx, actor, created, "CREATE", { reason, toStatus: MarketLaunchStatus.DRAFT, toOperational: MarketOperationalStatus.ACTIVE });
        return created;
      });
      return this.mapMarket(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException({ code: "MARKET_EXISTS", message: `Market ${value.code} already exists` });
      }
      throw e;
    }
  }

  async patch(user: JwtUser, id: string, dto: PatchMarketDto) {
    return this.patchAs(actorFromJwt(user), id, dto);
  }

  async patchAs(actor: MarketActor, id: string, dto: PatchMarketDto) {
    const existing = await this.loadRow(id);
    const data: Prisma.MarketUpdateInput = {};
    const changed: string[] = [];
    const set = <K extends keyof PatchMarketDto>(key: K, apply: (v: NonNullable<PatchMarketDto[K]>) => void) => {
      if (dto[key] !== undefined) {
        apply(dto[key] as NonNullable<PatchMarketDto[K]>);
        changed.push(String(key));
      }
    };
    set("nameEn", (v) => (data.nameEn = v.trim()));
    set("nameAr", (v) => (data.nameAr = v.trim()));
    const structural = (["dataRegion", "hostCell", "defaultCurrency", "defaultTimezone", "defaultPhoneRegion"] as const).filter((k) => dto[k] !== undefined);
    if (structural.length && existing.status !== MarketLaunchStatus.DRAFT) {
      throw new ConflictException({
        code: "MARKET_LOCKED_AFTER_LAUNCH",
        message: `${structural.join(", ")} cannot change after launch (only the names); a correction is a documented data-fix`,
      });
    }
    set("dataRegion", (v) => (data.dataRegion = v.trim()));
    set("hostCell", (v) => (data.hostCell = v.trim()));
    set("defaultCurrency", (v) => (data.defaultCurrency = v.trim()));
    set("defaultTimezone", (v) => (data.defaultTimezone = v.trim()));
    set("defaultPhoneRegion", (v) => (data.defaultPhoneRegion = v.trim()));
    if (!Object.keys(data).length) throw new BadRequestException({ code: "NO_FIELDS", message: "No supported fields to update" });
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.market.update({ where: { id }, data, include: { _count: { select: { tenants: true } } } });
      await this.writeAudit(tx, actor, updated, "UPDATE_DETAILS", { reason: "Market details updated", metadata: { changed } });
      return updated;
    });
    return this.mapMarket(row);
  }

  async remove(user: JwtUser, id: string) {
    return this.removeAs(actorFromJwt(user), id);
  }

  async removeAs(actor: MarketActor, id: string) {
    const row = await this.loadRow(id);
    if (row.status !== MarketLaunchStatus.DRAFT) {
      throw new ConflictException({ code: "ONLY_DRAFT_DELETABLE", message: "Only draft markets can be deleted" });
    }
    if (row._count.tenants > 0) throw new ConflictException({ code: "MARKET_HAS_ORGANIZATIONS", message: "Market has organizations, cannot delete" });
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.market.deleteMany({ where: { id, status: MarketLaunchStatus.DRAFT, tenants: { none: {} } } });
      if (res.count !== 1) throw new ConflictException({ code: "MARKET_STATE_CHANGED", message: "The market changed while deleting; reload and retry" });
      await this.writeAudit(tx, actor, row, "DELETE_DRAFT", { reason: "Draft market deleted" });
    });
    return { ok: true as const };
  }

  // ───────────── feature flags (unchanged behaviour) ─────────────

  async listFeatureFlags(user: JwtUser, marketId: string) {
    actorFromJwt(user);
    await this.loadRow(marketId);
    return this.featureFlags.listForMarket(marketId);
  }

  async patchFeatureFlag(user: JwtUser, marketId: string, key: string, enabled: boolean) {
    actorFromJwt(user);
    const row = await this.loadRow(marketId);
    this.featureFlags.assertNotManaged();
    assertSubProcessorAllowedForFeatureFlag(row, key, enabled);
    await this.featureFlags.setMarketFlag(marketId, key, enabled);
    return this.featureFlags.listForMarket(marketId);
  }

  // ───────────── lifecycle: Go live, Pause, Disable, Enable ─────────────

  launch(user: JwtUser, id: string, body: unknown) {
    return this.transition(actorFromJwt(user), id, "LAUNCH", body);
  }
  pause(user: JwtUser, id: string, body: unknown) {
    return this.transition(actorFromJwt(user), id, "PAUSE", body);
  }
  disable(user: JwtUser, id: string, body: unknown) {
    return this.transition(actorFromJwt(user), id, "DISABLE", body);
  }
  enable(user: JwtUser, id: string, body: unknown) {
    return this.transition(actorFromJwt(user), id, "ENABLE", body);
  }

  /**
   * One entry point for the four lifecycle changes. Reason is mandatory; approval reference and link are recorded. With the optional second-approver
   * setting ON the change becomes a PENDING request that a different person approves. The state change and its audit row commit together, and the
   * state change is conditional on the state it was decided from, so a double click or two administrators cannot launch (or audit) twice.
   */
  async transition(actor: MarketActor, id: string, action: MarketTransition, rawBody: unknown) {
    const input = parseTransitionInput(rawBody, { allowDays: action === "PAUSE" });
    await this.refreshExpiredPauses();
    const market = await this.loadRow(id);
    if (market.requireSecondApprover) {
      const request = await this.prisma.$transaction(async (tx) => {
        const dup = await tx.marketChangeRequest.findFirst({ where: { marketId: id, action, status: "PENDING" } });
        if (dup) throw new ConflictException({ code: "REQUEST_ALREADY_PENDING", message: `A ${action} request for this market is already waiting for a second approver`, requestId: dup.id });
        const created = await tx.marketChangeRequest.create({
          data: {
            marketId: id,
            marketCode: market.code,
            action,
            params: { days: input.days ?? null } as Prisma.InputJsonValue,
            reason: input.reason,
            approvalRef: input.approvalRef,
            approvalLink: input.approvalLink,
            requestedBy: actor.id,
            requestedEmail: actor.email,
            requestedSource: actor.source,
          },
        });
        await this.writeAudit(tx, actor, market, `${action}_REQUESTED`, { reason: input.reason, approvalRef: input.approvalRef, approvalLink: input.approvalLink, requestId: created.id });
        return created;
      });
      return { pending: true as const, requestId: request.id, market: this.mapMarket(market) };
    }
    return this.applyTransition(actor, market, action, input, {});
  }

  async approveRequest(actor: MarketActor, marketId: string, requestId: string, note?: string) {
    const req = await this.prisma.marketChangeRequest.findFirst({ where: { id: requestId, marketId } });
    if (!req) throw new NotFoundException({ code: "REQUEST_NOT_FOUND", message: "Request not found" });
    if (req.status !== "PENDING") throw new ConflictException({ code: "REQUEST_NOT_PENDING", message: `Request is ${req.status}` });
    if (req.requestedBy === actor.id || (req.requestedEmail && actor.email && req.requestedEmail.toLowerCase() === actor.email.toLowerCase())) {
      throw new ForbiddenException({ code: "SECOND_APPROVER_MUST_DIFFER", message: "A different person must approve this change" });
    }
    const claimed = await this.prisma.marketChangeRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: { status: "APPLIED", decidedBy: actor.id, decidedEmail: actor.email, decidedSource: actor.source, decisionNote: note?.slice(0, 500) ?? null, decidedAt: new Date() },
    });
    if (claimed.count !== 1) throw new ConflictException({ code: "REQUEST_NOT_PENDING", message: "Request was already decided" });
    const market = await this.loadRow(marketId);
    const days = typeof (req.params as { days?: unknown })?.days === "number" ? ((req.params as { days: number }).days) : undefined;
    const input: TransitionInput = { reason: req.reason, approvalRef: req.approvalRef, approvalLink: req.approvalLink, days };
    try {
      return await this.applyTransition({ id: req.requestedBy, email: req.requestedEmail, source: req.requestedSource as MarketActor["source"] }, market, req.action as MarketTransition, input, {
        requestId,
        secondApprover: actor,
      });
    } catch (e) {
      // the change could not be applied (state moved on, a prerequisite is missing): put the request back so it is not lost
      await this.prisma.marketChangeRequest.updateMany({
        where: { id: requestId, status: "APPLIED", decidedBy: actor.id },
        data: { status: "PENDING", decidedBy: null, decidedEmail: null, decidedSource: null, decidedAt: null },
      });
      throw e;
    }
  }

  async rejectRequest(actor: MarketActor, marketId: string, requestId: string, note?: string) {
    const req = await this.prisma.marketChangeRequest.findFirst({ where: { id: requestId, marketId } });
    if (!req) throw new NotFoundException({ code: "REQUEST_NOT_FOUND", message: "Request not found" });
    const market = await this.loadRow(marketId);
    const isRequester = req.requestedBy === actor.id;
    const res = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.marketChangeRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: { status: isRequester ? "CANCELLED" : "REJECTED", decidedBy: actor.id, decidedEmail: actor.email, decidedSource: actor.source, decisionNote: note?.slice(0, 500) ?? null, decidedAt: new Date() },
      });
      if (upd.count !== 1) throw new ConflictException({ code: "REQUEST_NOT_PENDING", message: "Request was already decided" });
      await this.writeAudit(tx, actor, market, `${req.action}_${isRequester ? "CANCELLED" : "REJECTED"}`, { reason: note?.trim() || (isRequester ? "Withdrawn by the requester" : "Rejected"), requestId });
      return upd;
    });
    void res;
    return { ok: true as const, status: isRequester ? "CANCELLED" : "REJECTED" };
  }

  async setSecondApprover(actor: MarketActor, marketId: string, enabled: unknown, rawBody: unknown) {
    if (typeof enabled !== "boolean") throw new BadRequestException({ code: "REQUIRE_SECOND_APPROVER_INVALID", message: "requireSecondApprover must be true or false" });
    const input = parseTransitionInput(rawBody);
    const market = await this.loadRow(marketId);
    if (market.requireSecondApprover === enabled) return this.mapMarket(market);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.market.update({ where: { id: marketId }, data: { requireSecondApprover: enabled }, include: { _count: { select: { tenants: true } } } });
      await this.writeAudit(tx, actor, updated, "SECOND_APPROVER_SETTING", { reason: input.reason, approvalRef: input.approvalRef, approvalLink: input.approvalLink, metadata: { from: market.requireSecondApprover, to: enabled } });
      return updated;
    });
    return this.mapMarket(row);
  }

  async updateTaxPack(actor: MarketActor, marketId: string, body: unknown) {
    const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
    const input = parseTransitionInput(b);
    const num = (key: string, min: number, max: number): number => {
      const v = b[key];
      if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
        throw new BadRequestException({ code: "TAX_PACK_INVALID", field: key, message: `${key} must be a number from ${min} to ${max}` });
      }
      return v;
    };
    const invoiceVatPercent = num("invoiceVatPercent", 0, 100);
    const saasVatPercent = num("saasVatPercent", 0, 100);
    const defaultVisitFee = num("defaultVisitFee", 0, 1_000_000);
    const trnRequired = b.trnRequired === undefined ? false : b.trnRequired;
    if (typeof trnRequired !== "boolean") throw new BadRequestException({ code: "TAX_PACK_INVALID", field: "trnRequired", message: "trnRequired must be true or false" });
    let trnFormat: string | null = null;
    if (b.trnFormat !== undefined && b.trnFormat !== null && b.trnFormat !== "") {
      if (typeof b.trnFormat !== "string" || b.trnFormat.length > 120) throw new BadRequestException({ code: "TAX_PACK_INVALID", field: "trnFormat", message: "trnFormat must be a pattern of at most 120 characters" });
      try {
        new RegExp(b.trnFormat);
      } catch {
        throw new BadRequestException({ code: "TAX_PACK_INVALID", field: "trnFormat", message: "trnFormat is not a valid pattern" });
      }
      trnFormat = b.trnFormat;
    }
    const market = await this.loadRow(marketId);
    const previous = parseMarketTaxPack(market.taxConfig);
    const merged = { ...((market.taxConfig as Record<string, unknown>) ?? {}), invoiceVatPercent, saasVatPercent, defaultVisitFee, trnFormat, trnRequired };
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.market.update({ where: { id: marketId }, data: { taxConfig: merged as Prisma.InputJsonValue }, include: { _count: { select: { tenants: true } } } });
      await this.writeAudit(tx, actor, updated, "TAX_PACK_UPDATED", { reason: input.reason, approvalRef: input.approvalRef, approvalLink: input.approvalLink, metadata: { previous, next: { invoiceVatPercent, saasVatPercent, defaultVisitFee, trnRequired, trnFormat } } });
      return updated;
    });
    return this.mapMarket(row);
  }

  private async applyTransition(
    actor: MarketActor,
    market: MarketRow,
    action: MarketTransition,
    input: TransitionInput,
    ctx: { requestId?: string; secondApprover?: MarketActor },
  ) {
    const id = market.id;
    const fromStatus = market.status;
    const fromOperational = effectiveOperationalStatus(market);
    const audit = (tx: Prisma.TransactionClient, row: MarketRow, toStatus: MarketLaunchStatus, toOperational: MarketOperationalStatus, metadata: Record<string, unknown> = {}) =>
      this.writeAudit(tx, actor, row, action, {
        reason: input.reason,
        approvalRef: input.approvalRef,
        approvalLink: input.approvalLink,
        fromStatus,
        toStatus,
        fromOperational,
        toOperational,
        requestId: ctx.requestId,
        secondApproverId: ctx.secondApprover?.id,
        metadata: { ...metadata, ...(ctx.secondApprover?.email ? { secondApproverEmail: ctx.secondApprover.email } : {}) },
      });
    const include = { _count: { select: { tenants: true } } } as const;

    if (action === "LAUNCH") {
      if (fromStatus === MarketLaunchStatus.LIVE) throw new ConflictException({ code: "MARKET_ALREADY_LIVE", message: "Market is already live" });
      if (fromStatus === MarketLaunchStatus.SUNSET) throw new ConflictException({ code: "MARKET_SUNSET", message: "A sunset market cannot be launched again" });
      // (assertLiveMarketHasTaxPack only guards markets that are already LIVE, so the DRAFT -> LIVE gate is checked here)
      if (!parseMarketTaxPack(market.taxConfig)) {
        throw new BadRequestException({
          code: "TAX_PACK_MISSING",
          message: `Market pack ${market.code} must define taxConfig (invoiceVatPercent, saasVatPercent, defaultVisitFee) before going live`,
        });
      }
      assertMarketReadyForCrossBorderLaunch(market);
      assertMarketMatchesProductionBinding(market);
      let provision;
      try {
        getDeploymentCell(market.hostCell.trim() || "frankfurt");
        provision = this.provision.resolveProvision(market.dataRegion, market.hostCell);
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException({
          code: "HOST_CELL_UNKNOWN",
          message: `Host cell "${market.hostCell}" is not in the data-cell registry (platform/data-cells.json). Add the cell (a deployment decision) before launch.`,
        });
      }
      let note = provision.message;
      const deployLog = await this.provision.tryTriggerDeploy(provision.dataRegion);
      if (deployLog) note = `${note}\n${deployLog}`;
      const row = await this.prisma.$transaction(async (tx) => {
        const res = await tx.market.updateMany({
          where: { id, status: MarketLaunchStatus.DRAFT },
          data: { status: MarketLaunchStatus.LIVE, launchedAt: new Date(), operationalStatus: MarketOperationalStatus.ACTIVE, pausedUntil: null, lastProvisionNote: note },
        });
        if (res.count !== 1) throw new ConflictException({ code: "MARKET_ALREADY_LIVE", message: "Market is already live" });
        const updated = await tx.market.findUniqueOrThrow({ where: { id }, include });
        await audit(tx, updated, MarketLaunchStatus.LIVE, MarketOperationalStatus.ACTIVE, { provisionMode: provision.mode });
        return updated;
      });
      return { ...this.mapMarket(row), provision: { mode: provision.mode, message: note } };
    }

    if (fromStatus !== MarketLaunchStatus.LIVE) {
      throw new ConflictException({ code: "MARKET_NOT_LIVE", message: `Only live markets can be ${action === "ENABLE" ? "enabled" : action === "PAUSE" ? "paused" : "disabled"}` });
    }

    if (action === "PAUSE") {
      const days = input.days ?? 7;
      const pausedUntil = new Date();
      pausedUntil.setUTCDate(pausedUntil.getUTCDate() + days);
      const row = await this.prisma.$transaction(async (tx) => {
        const res = await tx.market.updateMany({
          where: { id, status: MarketLaunchStatus.LIVE },
          data: { operationalStatus: MarketOperationalStatus.PAUSED, pausedUntil },
        });
        if (res.count !== 1) throw new ConflictException({ code: "MARKET_STATE_CHANGED", message: "The market changed; reload and retry" });
        const updated = await tx.market.findUniqueOrThrow({ where: { id }, include });
        await audit(tx, updated, updated.status, MarketOperationalStatus.PAUSED, { days, pausedUntil: pausedUntil.toISOString() });
        return updated;
      });
      return this.mapMarket(row);
    }

    const target = action === "DISABLE" ? MarketOperationalStatus.DISABLED : MarketOperationalStatus.ACTIVE;
    if (fromOperational === target) {
      // idempotent: already in the requested state, nothing changes and nothing is audited a second time
      return { ...this.mapMarket(market), unchanged: true as const };
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const res = await tx.market.updateMany({
        where: { id, status: MarketLaunchStatus.LIVE, NOT: { operationalStatus: target } },
        data: { operationalStatus: target, pausedUntil: null },
      });
      if (res.count !== 1) return null;
      const updated = await tx.market.findUniqueOrThrow({ where: { id }, include });
      await audit(tx, updated, updated.status, target);
      return updated;
    });
    if (!row) return { ...this.mapMarket(await this.loadRow(id)), unchanged: true as const };
    return this.mapMarket(row);
  }

  // ───────────── audit + mapping ─────────────

  async writeAudit(
    tx: Prisma.TransactionClient,
    actor: MarketActor,
    market: { id: string; code: string; status?: MarketLaunchStatus; operationalStatus?: MarketOperationalStatus },
    action: string,
    o: {
      reason: string;
      approvalRef?: string | null;
      approvalLink?: string | null;
      fromStatus?: MarketLaunchStatus;
      toStatus?: MarketLaunchStatus;
      fromOperational?: MarketOperationalStatus;
      toOperational?: MarketOperationalStatus;
      requestId?: string;
      secondApproverId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.marketAuditEvent.create({
      data: {
        marketId: market.id,
        marketCode: market.code,
        action,
        fromStatus: o.fromStatus ?? null,
        toStatus: o.toStatus ?? null,
        fromOperational: o.fromOperational ?? null,
        toOperational: o.toOperational ?? null,
        actorId: actor.id,
        actorEmail: actor.email,
        actorSource: actor.source,
        reason: o.reason,
        approvalRef: o.approvalRef ?? null,
        approvalLink: o.approvalLink ?? null,
        secondApproverId: o.secondApproverId ?? null,
        requestId: o.requestId ?? null,
        metadata: (o.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  /** What stands between a draft and Go live, in the order a launch owner works through it. Never throws. */
  readiness(m: Pick<MarketRow, "code" | "status" | "taxConfig" | "legalConfig" | "hostCell" | "dataRegion" | "commercialConfig">) {
    const blockers: Array<{ code: string; message: string }> = [];
    const taxPack = parseMarketTaxPack(m.taxConfig);
    if (!taxPack) blockers.push({ code: "TAX_PACK_MISSING", message: "Tax pack (invoice VAT, SaaS VAT, default visit fee) is not set" });
    const crossBorderRequired = marketRequiresCrossBorderApproval(m);
    let legalOk = true;
    let legalInvalid = false;
    try {
      legalOk = crossBorderRequired ? hasCrossBorderLaunchApproval(readLegalConfig(m)) : true;
    } catch {
      legalInvalid = true;
      legalOk = false;
    }
    if (legalInvalid) blockers.push({ code: "LEGAL_CONFIG_INVALID", message: "Legal configuration is not valid" });
    else if (!legalOk) blockers.push({ code: "CROSS_BORDER_APPROVAL_REQUIRED", message: "A cross-border transfer approval (or an active legal pilot exception) is required" });
    let cellKnown = true;
    try {
      getDeploymentCell(m.hostCell.trim() || "frankfurt");
    } catch {
      cellKnown = false;
      blockers.push({ code: "HOST_CELL_UNKNOWN", message: `Host cell "${m.hostCell}" is not in the data-cell registry` });
    }
    try {
      assertMarketMatchesProductionBinding(m);
    } catch {
      blockers.push({ code: "PRODUCTION_BINDING_MISMATCH", message: "Host cell and data region do not match the data residency decision for this country" });
    }
    const commercial = m.commercialConfig && typeof m.commercialConfig === "object" && !Array.isArray(m.commercialConfig) && Object.keys(m.commercialConfig as object).length > 0;
    return {
      taxPack: taxPack ? { ok: true, invoiceVatPercent: taxPack.invoiceVatPercent, saasVatPercent: taxPack.saasVatPercent, defaultVisitFee: taxPack.defaultVisitFee, trnRequired: taxPack.trnRequired, trnFormat: taxPack.trnFormat } : { ok: false },
      crossBorder: { required: crossBorderRequired, approved: legalOk, invalid: legalInvalid },
      hostCellKnown: cellKnown,
      commercialConfigured: Boolean(commercial),
      blockers,
      canLaunch: m.status === MarketLaunchStatus.DRAFT && blockers.length === 0,
    };
  }

  mapMarket(m: Partial<MarketRow> & {
    id: string;
    code: string;
    nameEn: string;
    nameAr: string;
    status: MarketLaunchStatus;
    launchedAt: Date | null;
    dataRegion: string;
    hostCell: string;
    defaultCurrency: string;
    defaultLocale: string;
    defaultTimezone: string;
    defaultPhoneRegion: string;
    paymentMethods: unknown;
    taxConfig: unknown;
    providerConfig: unknown;
    legalConfig: unknown;
    commercialConfig?: unknown;
    operationalStatus: MarketOperationalStatus;
    pausedUntil: Date | null;
    lastProvisionNote: string | null;
  }) {
    const op = effectiveOperationalStatus(m);
    let legal: ReturnType<typeof readLegalConfig> = {};
    try {
      legal = readLegalConfig(m);
    } catch {
      legal = {};
    }
    const crossBorderRequired = marketRequiresCrossBorderApproval(m);
    const readiness = this.readiness({ ...m, commercialConfig: m.commercialConfig ?? {} } as MarketRow);
    return {
      id: m.id,
      code: m.code,
      nameEn: m.nameEn,
      nameAr: m.nameAr,
      status: m.status,
      launchedAt: m.launchedAt?.toISOString() ?? null,
      dataRegion: m.dataRegion,
      hostCell: m.hostCell,
      defaultCurrency: m.defaultCurrency,
      defaultLocale: m.defaultLocale,
      defaultTimezone: m.defaultTimezone,
      defaultPhoneRegion: m.defaultPhoneRegion,
      paymentMethods: m.paymentMethods,
      taxConfig: m.taxConfig,
      providerConfig: m.providerConfig,
      operationalStatus: op,
      operability: marketOperabilityLabel(m),
      pausedUntil: m.pausedUntil?.toISOString() ?? null,
      lastProvisionNote: m.lastProvisionNote,
      acceptsNewOrganizations: m.status === MarketLaunchStatus.LIVE && op === MarketOperationalStatus.ACTIVE,
      crossBorderRequired,
      crossBorderApprovalRef: legal.crossBorderTransfer?.approvalRef ?? null,
      crossBorderExpiresAt: legal.crossBorderTransfer?.expiresAt ?? legal.pilotException?.expiresAt ?? null,
      legalLaunchApproved: crossBorderRequired ? readiness.crossBorder.approved : true,
      legalExpiresInDays: daysUntilCrossBorderExpiry(legal),
      requireSecondApprover: m.requireSecondApprover ?? false,
      organizationCount: m._count?.tenants ?? null,
      readiness,
    };
  }
}
