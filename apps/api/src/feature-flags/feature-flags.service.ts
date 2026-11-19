import { BadRequestException, ConflictException, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PLAN_GATED_FEATURE_FLAGS } from "../entitlements/plans-matrix";
import { EntitlementsService } from "../entitlements/entitlements.service";
import { entitlementTruthy } from "../entitlements/entitlement-value";
import {
  CLINIC_FLAG_KEYS,
  EXTERNAL_PARENT_FLAG_KEYS,
  getFlagDefinition,
  isKnownFeatureFlagKey,
  isLegacyFeatureFlagKey,
  type FeatureFlagKey,
  type FlagClass,
  type FlagScopeName,
} from "./feature-flag-keys";
import { resolveFlag, type FlagBlockedBy, type FlagResolution, type FlagValue } from "./feature-flag-resolution";
import type { SnapshotFlag } from "./kiorex-flag-snapshot";
import { KiorexFlagSnapshotService } from "./kiorex-flag-snapshot.service";

export type FeatureFlagLayerView = {
  key: string;
  description: string;
  descriptionAr: string;
  class: FlagClass;
  scopes: FlagScopeName[];
  dependsOn: string[];
  launchLocked: boolean;
  /** Launch-locked flag that is ON in every scope but has no gate evidence yet ("ON · awaiting gate"). */
  awaitingGate: boolean;
  globalEnabled: boolean;
  marketEnabled: boolean | null;
  tenantEnabled: boolean | null;
  effective: boolean;
  /** Which rule decided the effective value. */
  source: FlagResolution["source"];
  /** True when the Kiorex control plane is the authority (platform/market layers are read-only mirrors). */
  managed: boolean;
};

export type FlagEvaluation = FlagResolution & { key: string };

type EvalContext = {
  tenantId: string | null;
  marketCode: string | null;
  planEntitlements: Record<string, unknown> | null;
  legacyGlobal: Map<string, boolean>;
  legacyMarket: Map<string, boolean | null>;
  legacyTenant: Map<string, boolean | null>;
};

const EMPTY_CTX: EvalContext = {
  tenantId: null,
  marketCode: null,
  planEntitlements: null,
  legacyGlobal: new Map(),
  legacyMarket: new Map(),
  legacyTenant: new Map(),
};

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Optional() private readonly snapshots?: KiorexFlagSnapshotService,
  ) {}

  /** True when Kiorex is the authority for platform/market flag values (FF05 read-only mode). */
  isManaged(): boolean {
    return this.snapshots?.isManaged() ?? false;
  }

  snapshotMeta() {
    return this.snapshots?.meta() ?? null;
  }

  async isEnabled(tenantId: string, key: FeatureFlagKey | string): Promise<boolean> {
    return (await this.evaluate(tenantId, key)).effective;
  }

  /** Tenant orgs: platform ∧ market ∧ org. Platform users without tenantId: global master only. */
  async isEnabledForUser(tenantId: string | null | undefined, key: FeatureFlagKey | string): Promise<boolean> {
    return (await this.evaluate(tenantId ?? null, key)).effective;
  }

  /** Full evaluation (rules 1–7) with the deciding source/scope, used by the 403 FEATURE_DISABLED guard. */
  async evaluate(tenantId: string | null, key: string): Promise<FlagEvaluation> {
    if (!isKnownFeatureFlagKey(key) && !(EXTERNAL_PARENT_FLAG_KEYS as readonly string[]).includes(key)) {
      return { key, effective: false, source: "global", scope: "global" };
    }
    let ctx = tenantId ? await this.loadContext(tenantId, [key]) : EMPTY_CTX;
    if (!ctx.tenantId) {
      // Platform users without a tenant: global master only.
      const globals = await this.prisma.featureFlag.findMany({ where: { key: { in: [...CLINIC_FLAG_KEYS] } } });
      ctx = { ...EMPTY_CTX, legacyGlobal: new Map(globals.map((g) => [g.key, g.enabled])) };
    }
    return { key, ...this.evalKey(ctx, key, []) };
  }

  /**
   * Launch-locked specialty templates: hidden ONLY when a Kiorex snapshot exists AND (it marks the specialty flag
   * gate-unsatisfied, or the flag is switched OFF for this scope). No snapshot (local dev, fresh deploy) or a
   * snapshot that does not carry the flag at all => visible (dev defaults show them).
   */
  async isSpecialtyTemplateVisible(tenantId: string, specialtyFlagKey: string): Promise<boolean> {
    if (!this.snapshots?.getSnapshot()) return true;
    const snap = this.snapshots.getFlag(specialtyFlagKey);
    if (!snap) return true;
    if (snap.launchLocked && snap.gateSatisfied !== true) return false;
    const ctx = await this.loadContext(tenantId, [specialtyFlagKey]);
    const { g, m, o } = this.layerValues(ctx, specialtyFlagKey);
    return g !== "OFF" && m !== "OFF" && o !== "OFF";
  }

  async listForTenant(tenantId: string): Promise<FeatureFlagLayerView[]> {
    const keys = this.listedKeys();
    const ctx = await this.loadContext(tenantId, keys);
    if (!ctx.tenantId) return [];
    return keys.map((key) => this.toView(ctx, key, true));
  }

  async listForMarket(marketId: string): Promise<FeatureFlagLayerView[]> {
    const market = await this.prisma.market.findUnique({ where: { id: marketId }, include: { featureFlags: true } });
    if (!market) return [];
    const globals = await this.prisma.featureFlag.findMany({ where: { key: { in: [...CLINIC_FLAG_KEYS] } } });
    const ctx: EvalContext = {
      ...EMPTY_CTX,
      marketCode: market.code,
      legacyGlobal: new Map(globals.map((g) => [g.key, g.enabled])),
      legacyMarket: new Map(
        CLINIC_FLAG_KEYS.map((k) => {
          const row = market.featureFlags.find((f) => f.key === k);
          return [k, row ? row.enabled : this.marketDefaultFromJson(market.featureDefaults, k)] as const;
        }),
      ),
    };
    return this.listedKeys().map((key) => this.toView(ctx, key, false));
  }

  /** Platform → Overview rows: global layer per flag (mirrors the snapshot when managed). */
  async listGlobal(): Promise<FeatureFlagLayerView[]> {
    const globals = await this.prisma.featureFlag.findMany({ where: { key: { in: [...CLINIC_FLAG_KEYS] } } });
    const ctx: EvalContext = { ...EMPTY_CTX, legacyGlobal: new Map(globals.map((g) => [g.key, g.enabled])) };
    return this.listedKeys().map((key) => this.toView(ctx, key, false));
  }

  async setTenantFlag(tenantId: string, key: string, enabled: boolean) {
    const def = getFlagDefinition(key);
    if (!def) throw new BadRequestException("Unknown feature flag key");
    if (!def.scopes.includes("org")) {
      throw new BadRequestException("This flag cannot be switched at organization scope");
    }
    const row = await this.prisma.tenantFeatureFlag.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, enabled, description: def.descriptionEn },
      update: { enabled },
    });
    if (key === "whatsapp_reminders") {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { whatsAppRemindersEnabled: enabled },
      });
    }
    // Local org switch: let flag-derived state (listing status) recompute immediately.
    await this.snapshots?.notifyChanged([
      { key, scope: "org", scopeId: tenantId, from: enabled ? "OFF" : "INHERIT", to: enabled ? "INHERIT" : "OFF" },
    ]);
    return row;
  }

  async setMarketFlag(marketId: string, key: string, enabled: boolean) {
    const def = getFlagDefinition(key);
    if (!def) throw new BadRequestException("Unknown feature flag key");
    this.assertNotManaged();
    return this.prisma.marketFeatureFlag.upsert({
      where: { marketId_key: { marketId, key } },
      create: { marketId, key, enabled, description: def.descriptionEn },
      update: { enabled },
    });
  }

  /** FF05: platform/market writes are rejected when Kiorex is the authority. */
  assertNotManaged(): void {
    if (this.isManaged()) {
      throw new ConflictException({
        statusCode: 409,
        code: "FLAG_MANAGED_BY_KIOREX",
        message: "Feature flags are managed in the Kiorex super admin.",
      });
    }
  }

  async allowedTransferChannels(tenantId: string): Promise<Set<string>> {
    const { resolveTenantTransferCollectionContext } = await import("../common/market-transfer-context");
    const ctx = await resolveTenantTransferCollectionContext(this.prisma, this, tenantId);
    return ctx.allowedTransferChannels;
  }

  // ---- internals -------------------------------------------------------------------------------------------------

  private listedKeys(): string[] {
    const fromSnapshot = (this.snapshots?.getSnapshot()?.flags ?? [])
      .map((f) => f.key)
      .filter((k) => getFlagDefinition(k) && !CLINIC_FLAG_KEYS.includes(k));
    return [...CLINIC_FLAG_KEYS, ...fromSnapshot];
  }

  private async loadContext(tenantId: string, keys: string[]): Promise<EvalContext> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { market: { include: { featureFlags: true } }, tenantFeatureFlags: true },
    });
    if (!tenant) return EMPTY_CTX;
    const globals = await this.prisma.featureFlag.findMany({ where: { key: { in: [...CLINIC_FLAG_KEYS] } } });
    const legacyTenant = new Map<string, boolean | null>();
    for (const k of new Set([...keys, ...CLINIC_FLAG_KEYS])) {
      const row = tenant.tenantFeatureFlags.find((f) => f.key === k);
      let v: boolean | null = row ? row.enabled : null;
      if (k === "whatsapp_reminders" && row == null) v = tenant.whatsAppRemindersEnabled;
      legacyTenant.set(k, v);
    }
    const legacyMarket = new Map<string, boolean | null>();
    for (const k of CLINIC_FLAG_KEYS) {
      const row = tenant.market?.featureFlags.find((f) => f.key === k);
      legacyMarket.set(k, row ? row.enabled : this.marketDefaultFromJson(tenant.market?.featureDefaults, k));
    }
    const ent = await this.entitlements.resolve(tenantId);
    return {
      tenantId,
      marketCode: tenant.market?.code ?? null,
      planEntitlements: (ent?.entitlements as Record<string, unknown> | undefined) ?? null,
      legacyGlobal: new Map(globals.map((g) => [g.key, g.enabled])),
      legacyMarket,
      legacyTenant,
    };
  }

  private layerValues(ctx: EvalContext, key: string): { g: FlagValue; m: FlagValue; o: FlagValue; snap?: SnapshotFlag } {
    const snapState = this.snapshots?.getSnapshot() ?? null;
    const snap = this.snapshots?.getFlag(key);
    const toVal = (b: boolean | null | undefined): FlagValue => (b === false ? "OFF" : b === true ? "ON" : null);
    const live = (() => {
      const exp = snap?.expiresAt ? Date.parse(snap.expiresAt) : NaN;
      return !(Number.isFinite(exp) && exp <= Date.now());
    })();

    let g: FlagValue = null;
    let m: FlagValue = null;
    if (snapState) {
      if (snap && live) {
        if (snap.values.global === "OFF") g = "OFF";
        const code = ctx.marketCode?.toUpperCase();
        if (code && Object.entries(snap.values.markets ?? {}).some(([k, v]) => k.toUpperCase() === code && v === "OFF")) {
          m = "OFF";
        }
      }
    } else if (CLINIC_FLAG_KEYS.includes(key)) {
      // Unmanaged / no snapshot yet: the pre-v2 local platform and market layers still apply.
      if (ctx.legacyGlobal.get(key) === false) g = "OFF";
      m = toVal(ctx.legacyMarket.get(key));
    }

    // Organization scope: snapshot OFF for this org ∨ the org admin's own switch (org-scope flags only).
    let o: FlagValue = toVal(ctx.legacyTenant.get(key));
    if (snapState && snap && live && ctx.tenantId && snap.values.orgs?.[ctx.tenantId] === "OFF") o = "OFF";
    return { g, m, o, snap };
  }

  private evalKey(ctx: EvalContext, key: string, path: string[]): FlagResolution {
    if (path.includes(key)) return { effective: false, source: "dependency", scope: "global", blockedParent: key };
    const def = getFlagDefinition(key);
    const { g, m, o, snap } = this.layerValues(ctx, key);

    const entKey = isLegacyFeatureFlagKey(key) ? PLAN_GATED_FEATURE_FLAGS[key] : undefined;
    const planEntitled =
      !entKey || !ctx.planEntitlements ? true : entitlementTruthy(ctx.planEntitlements[entKey] as never);

    const launchLocked = (def?.launchLocked ?? false) || snap?.launchLocked === true;
    const gateSatisfied = snap?.gateSatisfied === true;
    const deps = def?.dependsOn ?? snap?.dependsOn ?? [];
    const parents = deps.map((p) => {
      const r = this.evalKey(ctx, p, [...path, key]);
      return { key: p, effective: r.effective, blockedBy: r.source as FlagBlockedBy, scope: r.scope };
    });
    return resolveFlag({
      globalValue: g,
      marketValue: m,
      orgValue: o,
      planEntitled,
      launchLocked,
      gateSatisfied,
      parents,
    });
  }

  private toView(ctx: EvalContext, key: string, forTenant: boolean): FeatureFlagLayerView {
    const def = getFlagDefinition(key)!;
    const { g, m, o } = this.layerValues(ctx, key);
    const res = this.evalKey(ctx, key, []);
    return {
      key,
      description: def.descriptionEn,
      descriptionAr: def.descriptionAr,
      class: def.class,
      scopes: [...def.scopes],
      dependsOn: [...def.dependsOn],
      launchLocked: def.launchLocked,
      awaitingGate: def.launchLocked && res.source === "gate",
      globalEnabled: g !== "OFF",
      marketEnabled: m === "OFF" ? false : m === "ON" ? true : null,
      tenantEnabled: forTenant ? (o === "OFF" ? false : o === "ON" ? true : null) : null,
      effective: res.effective,
      source: res.source,
      managed: this.isManaged(),
    };
  }

  private marketDefaultFromJson(featureDefaults: unknown, key: string): boolean | null {
    if (!featureDefaults || typeof featureDefaults !== "object" || Array.isArray(featureDefaults)) return null;
    const m = featureDefaults as Record<string, unknown>;
    const legacy: Record<string, string> = {
      whatsapp_reminders: "whatsAppReminders",
      instapay: "instapay",
      fawry: "fawry",
      card_payments: "cardPayments",
      ai_assistant: "aiAssistant",
    };
    const name = legacy[key];
    if (!name) return null;
    const v = m[name];
    return typeof v === "boolean" ? v : null;
  }
}
