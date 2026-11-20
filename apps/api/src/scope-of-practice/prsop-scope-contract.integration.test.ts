import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { PrismaClient, Profession, UserRole } from "@prisma/client";
import { ClinicalController } from "../clinical/clinical.controller";
import { RxShareController } from "../clinical/rx-share.controller";
import { EncountersController } from "../encounters/encounters.controller";
import { OperationsController } from "../operations/operations.controller";
import { REQUIRES_SCOPE_KEY } from "./requires-scope.decorator";
import { SCOPE_NOT_ALLOWED, ScopeNotAllowedException } from "./scope-not-allowed.exception";
import { ScopeGuard } from "./scope.guard";
import { ScopeOfPracticeService } from "./scope-of-practice.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

/**
 * Scope-of-practice contract tests (KX-22 wave A2 acceptance: "403 SCOPE_NOT_ALLOWED on every Rx endpoint for
 * physio/nurse"; KX-23 stop-ship: "nurse reaches prescribing endpoint"). Reflects over the real controllers, so a new
 * Rx / order / sign endpoint without @RequiresScope fails here.
 */
const prisma = createPrismaClient();
const reflector = new Reflector();
const guard = new ScopeGuard(reflector, new ScopeOfPracticeService(prisma as never));

type Handler = { controller: string; route: string; method: number; scope: string | undefined; fn: (...a: unknown[]) => unknown; cls: new (...a: never[]) => unknown };

function handlers(): Handler[] {
  const out: Handler[] = [];
  for (const cls of [ClinicalController, RxShareController, EncountersController, OperationsController] as const) {
    const base = String(Reflect.getMetadata(PATH_METADATA, cls) ?? "");
    for (const name of Object.getOwnPropertyNames(cls.prototype)) {
      const fn = cls.prototype[name as keyof typeof cls.prototype] as unknown as (...a: unknown[]) => unknown;
      if (typeof fn !== "function" || name === "constructor") continue;
      const path = Reflect.getMetadata(PATH_METADATA, fn);
      const method = Reflect.getMetadata(METHOD_METADATA, fn);
      if (path === undefined || method === undefined) continue;
      out.push({ controller: cls.name, route: `${base}/${path}`.replace(/\/+/g, "/"), method, scope: Reflect.getMetadata(REQUIRES_SCOPE_KEY, fn), fn, cls: cls as never });
    }
  }
  return out;
}

const RX_ROUTE = /(medications|prescription|rx\/check)/i;
const READ = 0; // RequestMethod.GET

describe("scope-of-practice contract: Rx endpoints", () => {
  const all = handlers();

  it("every write Rx route (medications, prescription print/send/handoff, rx/check, safety-check, reset-clinical) is @RequiresScope('rx.prescribe')", () => {
    const rx = all.filter((h) => h.method !== READ && (RX_ROUTE.test(h.route) || /reset-clinical|medications\/safety-check/.test(h.route)));
    assert.ok(rx.length >= 8, `expected ≥8 Rx routes, found ${rx.length}: ${rx.map((h) => h.route).join(", ")}`);
    for (const h of rx) assert.equal(h.scope, "rx.prescribe", `${h.controller} ${h.route} must be @RequiresScope("rx.prescribe")`);
  });

  it("lab / radiology order writes need orders.lab_radiology; finalize and amend need encounter.sign", () => {
    for (const h of all.filter((x) => x.method !== READ && /clinical\/orders/.test(x.route))) {
      assert.equal(h.scope, "orders.lab_radiology", `${h.route}`);
    }
    const sign = all.filter((x) => /encounters\/:id\/(finalize|amend)$/.test(x.route));
    assert.equal(sign.length, 2);
    for (const h of sign) assert.equal(h.scope, "encounter.sign", h.route);
  });

  describe("403 SCOPE_NOT_ALLOWED for physiotherapists and nurses (real users, real DB)", () => {
    const users: Partial<Record<Profession, string>> = {};
    let tenantId: string;
    const suffix = `${Date.now()}`;

    before(async () => {
      await prisma.$connect();
      const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
      tenantId = (await prisma.tenant.create({ data: { name: `Scope ${suffix}`, deploymentCell: "frankfurt", marketId: market.id } })).id;
      for (const p of [Profession.PHYSICIAN, Profession.DENTIST, Profession.PHYSIOTHERAPIST, Profession.NURSE, Profession.ASSISTANT]) {
        users[p] = (await prisma.user.create({ data: { tenantId, email: `scope.${p}.${suffix}@example.com`, passwordHash: "x", displayName: p, role: p === Profession.NURSE ? UserRole.NURSE : UserRole.PHYSICIAN, profession: p } })).id;
      }
    });
    after(async () => {
      await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
      await prisma.$disconnect();
    });

    function ctxFor(h: Handler, userId: string) {
      return { getHandler: () => h.fn, getClass: () => h.cls, switchToHttp: () => ({ getRequest: () => ({ user: { userId, tenantId } }) }) } as never;
    }

    it("physio / nurse / assistant: 403 on every Rx and lab-order route", async () => {
      const gated = all.filter((h) => h.scope === "rx.prescribe" || h.scope === "orders.lab_radiology");
      assert.ok(gated.length >= 12);
      for (const p of [Profession.PHYSIOTHERAPIST, Profession.NURSE, Profession.ASSISTANT] as const) {
        for (const h of gated) {
          await assert.rejects(guard.canActivate(ctxFor(h, users[p]!)), (e: ScopeNotAllowedException) => {
            const b = e.getResponse() as { code: string; profession: string; capability: string };
            assert.equal(e.getStatus(), 403);
            assert.deepEqual([b.code, b.profession, b.capability], [SCOPE_NOT_ALLOWED, p, h.scope]);
            return true;
          }, `${p} ${h.route}`);
        }
      }
    });

    it("physician and dentist pass every Rx / order route; only assistants are stopped at sign", async () => {
      for (const p of [Profession.PHYSICIAN, Profession.DENTIST] as const) {
        for (const h of all.filter((x) => x.scope)) assert.equal(await guard.canActivate(ctxFor(h, users[p]!)), true, `${p} ${h.route}`);
      }
      const sign = all.find((x) => x.scope === "encounter.sign")!;
      for (const p of [Profession.PHYSIOTHERAPIST, Profession.NURSE, Profession.PHYSICIAN]) assert.equal(await guard.canActivate(ctxFor(sign, users[p]!)), true);
      await assert.rejects(guard.canActivate(ctxFor(sign, users[Profession.ASSISTANT]!)), ScopeNotAllowedException);
    });

    it("market-pack override changes enforcement without code changes (versioned matrix)", async () => {
      const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
      const original = market.clinicalConfig;
      const { EG_PROFESSION_PACK } = await import("./profession-pack");
      const pack = JSON.parse(JSON.stringify(EG_PROFESSION_PACK));
      pack.scopeVersion = "2099-01-01.1";
      pack.scope.PHYSIOTHERAPIST.push("orders.lab_radiology");
      const h = all.find((x) => x.scope === "orders.lab_radiology")!;
      try {
        await prisma.market.update({ where: { id: market.id }, data: { clinicalConfig: { ...(original as object), professionPack: pack } } });
        assert.equal(await guard.canActivate(ctxFor(h, users[Profession.PHYSIOTHERAPIST]!)), true);
        const d = await new ScopeOfPracticeService(prisma as never).describeForUser(users[Profession.PHYSIOTHERAPIST]!);
        assert.equal(d?.scopeVersion, "2099-01-01.1");
      } finally {
        await prisma.market.update({ where: { id: market.id }, data: { clinicalConfig: original as never } });
      }
      await assert.rejects(guard.canActivate(ctxFor(h, users[Profession.PHYSIOTHERAPIST]!)), ScopeNotAllowedException);
    });
  });
});
