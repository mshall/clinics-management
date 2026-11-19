import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { Reflector } from "@nestjs/core";
import { Profession, UserRole } from "@prisma/client";
import {
  DEFAULT_PROFESSION_PACKS,
  EG_PROFESSION_PACK,
  PROFESSIONS,
  capabilitiesFor,
  checklistKeysFor,
  isListableProfession,
  parseProfessionPack,
  requiredDocumentsFor,
  resolveProfessionPack,
  scopeAllows,
  validateProfessionPack,
} from "./profession-pack";
import { RequiresScope } from "./requires-scope.decorator";
import { assertMarketProfessionPackValid } from "../markets/market-pack-validation";
import { SCOPE_CAPABILITIES, isScopeCapability, type ScopeCapability } from "./scope-capabilities";
import { SCOPE_NOT_ALLOWED, ScopeNotAllowedException } from "./scope-not-allowed.exception";
import { ScopeGuard } from "./scope.guard";
import { ScopeOfPracticeService, effectiveProfession } from "./scope-of-practice.service";

const SRC = join(process.cwd(), "src");

function listTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listTs(full, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("PRSOP02 capability registry and market-pack matrix", () => {
  it("every capability named in any shipped pack is registered (unknown capability fails CI)", () => {
    for (const [code, pack] of Object.entries(DEFAULT_PROFESSION_PACKS)) {
      assert.deepEqual(validateProfessionPack(pack), [], `pack ${code}`);
      for (const p of PROFESSIONS) for (const c of pack.scope[p]) assert.ok(isScopeCapability(c), `${code}.${p}: ${c}`);
    }
  });

  it("every @RequiresScope / assertCan capability in source is registered", () => {
    const re = /(?:RequiresScope|assertCan)\(\s*(?:[A-Za-z_.]+,\s*)?["']([^"']+)["']/g;
    let seen = 0;
    for (const f of listTs(SRC)) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(re)) {
        seen++;
        assert.ok(isScopeCapability(m[1]), `${relative(SRC, f)} references unknown capability "${m[1]}"`);
      }
    }
    assert.ok(seen >= 10, "expected the Rx / orders / sign endpoints to be decorated");
  });

  it("validator rejects an unknown capability, an unknown profession and a missing profession", () => {
    const bad = JSON.parse(JSON.stringify(EG_PROFESSION_PACK));
    bad.scope.NURSE.push("rx.prescribe_everything");
    assert.ok(validateProfessionPack(bad).some((e) => e.includes("unknown capability")));
    const bad2 = JSON.parse(JSON.stringify(EG_PROFESSION_PACK));
    bad2.scope.PODIATRIST = [];
    assert.ok(validateProfessionPack(bad2).some((e) => e.includes("unknown profession")));
    const bad3 = JSON.parse(JSON.stringify(EG_PROFESSION_PACK));
    delete bad3.scope.DENTIST;
    assert.ok(validateProfessionPack(bad3).some((e) => e.includes("scope.DENTIST")));
    assert.throws(() => parseProfessionPack(bad));
  });

  it("market pack validation rejects an invalid professionPack override and accepts a valid one", () => {
    const bad = JSON.parse(JSON.stringify(EG_PROFESSION_PACK));
    bad.scope.NURSE.push("drug.everything");
    assert.throws(() => assertMarketProfessionPackValid({ code: "XX", clinicalConfig: { professionPack: bad } }), /unknown capability/);
    assert.doesNotThrow(() => assertMarketProfessionPackValid({ code: "EG", clinicalConfig: { professionPack: EG_PROFESSION_PACK } }));
    assert.doesNotThrow(() => assertMarketProfessionPackValid({ code: "EG", clinicalConfig: {} }));
  });

  it("matrix is versioned and the CMO sign-off is never recorded by code (NEEDS_HUMAN)", () => {
    assert.match(EG_PROFESSION_PACK.scopeVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/);
    assert.equal(EG_PROFESSION_PACK.cmoSignOff, null);
  });

  it("BR49: physiotherapists, nurses and assistants can never prescribe or order labs; assistants never sign", () => {
    for (const p of [Profession.PHYSIOTHERAPIST, Profession.NURSE, Profession.ASSISTANT]) {
      assert.equal(scopeAllows(EG_PROFESSION_PACK, p, "rx.prescribe"), false, p);
      assert.equal(scopeAllows(EG_PROFESSION_PACK, p, "orders.lab_radiology"), false, p);
    }
    assert.equal(scopeAllows(EG_PROFESSION_PACK, Profession.ASSISTANT, "encounter.sign"), false);
    assert.equal(scopeAllows(EG_PROFESSION_PACK, Profession.ASSISTANT, "vitals.record"), true);
    assert.equal(scopeAllows(EG_PROFESSION_PACK, Profession.ASSISTANT, "sessions.record"), true);
  });

  it("KX-05 §06 matrix rows", () => {
    const can = (p: Profession, c: ScopeCapability) => scopeAllows(EG_PROFESSION_PACK, p, c);
    assert.ok(can("PHYSICIAN", "rx.prescribe") && can("DENTIST", "rx.prescribe"));
    assert.ok(can("PHYSICIAN", "orders.lab_radiology") && can("DENTIST", "orders.lab_radiology"));
    assert.ok(can("NURSE", "mar.administer") && can("PHYSICIAN", "mar.administer") && !can("DENTIST", "mar.administer") && !can("PHYSIOTHERAPIST", "mar.administer"));
    assert.ok(can("PHYSICIAN", "home_visits.perform") && can("PHYSIOTHERAPIST", "home_visits.perform") && can("NURSE", "home_visits.perform"));
    assert.ok(!can("DENTIST", "home_visits.perform"), "dentist: no home visits at launch");
    assert.ok(can("DENTIST", "encounter.template.dental_chart") && can("PHYSIOTHERAPIST", "encounter.template.physio") && can("NURSE", "encounter.template.nursing"));
    for (const p of ["PHYSICIAN", "DENTIST", "PHYSIOTHERAPIST", "NURSE"] as const) {
      for (const c of ["practice.core", "vitals.record", "outcome_measures.record", "assistant.supervise"] as const) assert.ok(can(p, c), `${p} ${c}`);
    }
    assert.ok(capabilitiesFor(EG_PROFESSION_PACK, Profession.PHYSIOTHERAPIST).every((c) => (SCOPE_CAPABILITIES as readonly string[]).includes(c)));
  });

  it("market pack override in Market.clinicalConfig.professionPack wins; invalid override falls back; unknown market uses the baseline", () => {
    const override = JSON.parse(JSON.stringify(EG_PROFESSION_PACK));
    override.marketCode = "AE";
    override.scopeVersion = "2027-01-01.1";
    override.scope.NURSE = ["vitals.record"];
    assert.equal(resolveProfessionPack({ code: "AE", clinicalConfig: { professionPack: override } }).scopeVersion, "2027-01-01.1");
    const invalid = JSON.parse(JSON.stringify(override));
    invalid.scope.NURSE = ["nope"];
    assert.equal(resolveProfessionPack({ code: "EG", clinicalConfig: { professionPack: invalid } }).scopeVersion, EG_PROFESSION_PACK.scopeVersion);
    assert.equal(resolveProfessionPack({ code: "ZZ", clinicalConfig: {} }).scopeVersion, EG_PROFESSION_PACK.scopeVersion);
    assert.equal(resolveProfessionPack(null).scopeVersion, EG_PROFESSION_PACK.scopeVersion);
  });
});

describe("PRVER01 verification rule per profession (market pack)", () => {
  it("registers match KX-05 §06 (Egypt)", () => {
    const codes = (p: Profession) => EG_PROFESSION_PACK.verification[p].registers.map((r) => r.code);
    assert.ok(codes("PHYSICIAN").includes("EG_MEDICAL_SYNDICATE"));
    assert.ok(codes("DENTIST").includes("EG_DENTISTS_SYNDICATE"));
    assert.ok(codes("PHYSIOTHERAPIST").includes("EG_PHYSICAL_THERAPY_SYNDICATE") && codes("PHYSIOTHERAPIST").includes("EG_MOH_PHYSIOTHERAPY_LICENCE"));
    assert.ok(codes("NURSE").includes("EG_NURSING_SYNDICATE") && codes("NURSE").includes("EG_MOH_LICENCE"));
  });

  it("badge names the profession in AR and EN", () => {
    assert.equal(EG_PROFESSION_PACK.verification.PHYSIOTHERAPIST.badgeEn, "Verified physiotherapist");
    for (const p of PROFESSIONS) {
      assert.ok(EG_PROFESSION_PACK.verification[p].badgeAr.length > 0);
      assert.ok(EG_PROFESSION_PACK.verification[p].labelAr.length > 0);
    }
  });

  it("PRVER04: solo nurses need ID selfie + criminal-record certificate on top; others do not", () => {
    const nurse = EG_PROFESSION_PACK.verification.NURSE;
    assert.ok(!requiredDocumentsFor(nurse, false).includes("CRIMINAL_RECORD_CERT"));
    assert.ok(requiredDocumentsFor(nurse, true).includes("CRIMINAL_RECORD_CERT") && requiredDocumentsFor(nurse, true).includes("ID_SELFIE"));
    assert.ok(checklistKeysFor(nurse, true).includes("id_selfie_match") && checklistKeysFor(nurse, true).includes("criminal_record_certificate"));
    assert.ok(!checklistKeysFor(nurse, false).includes("id_selfie_match"));
  });

  it("legacy physician submissions stay valid (ON-03 documents unchanged)", () => {
    const phys = EG_PROFESSION_PACK.verification.PHYSICIAN;
    assert.deepEqual(requiredDocumentsFor(phys, false), ["SYNDICATE_CARD", "SPECIALTY_CERTIFICATE"]);
    for (const k of ["syndicate_card", "specialty_match", "national_id_present", "documents_readable"]) assert.ok(checklistKeysFor(phys, false).includes(k), k);
  });

  it("assistants are never listable (PRSOP03)", () => {
    assert.equal(isListableProfession(EG_PROFESSION_PACK, Profession.ASSISTANT), false);
    assert.equal(isListableProfession(EG_PROFESSION_PACK, Profession.NURSE), true);
    assert.equal(isListableProfession(EG_PROFESSION_PACK, null), false);
  });

  it("number formats compile", () => {
    for (const p of PROFESSIONS) for (const r of EG_PROFESSION_PACK.verification[p].registers) if (r.numberFormat) new RegExp(r.numberFormat);
  });
});

describe("effectiveProfession (expand-phase legacy mapping)", () => {
  const row = (role: UserRole, profession: Profession | null = null, additionalRoles: UserRole[] = []) => ({ role, profession, additionalRoles });
  it("explicit profession wins; legacy NULL maps physician->PHYSICIAN, nurse->NURSE; admins are unscoped", () => {
    assert.equal(effectiveProfession(row(UserRole.PHYSICIAN, Profession.PHYSIOTHERAPIST)), Profession.PHYSIOTHERAPIST);
    assert.equal(effectiveProfession(row(UserRole.PHYSICIAN)), Profession.PHYSICIAN);
    assert.equal(effectiveProfession(row(UserRole.CLINIC_ADMIN, null, [UserRole.PHYSICIAN])), Profession.PHYSICIAN);
    assert.equal(effectiveProfession(row(UserRole.NURSE)), Profession.NURSE);
    assert.equal(effectiveProfession(row(UserRole.CLINIC_ADMIN)), null);
    assert.equal(effectiveProfession(row(UserRole.RECEPTIONIST)), null);
  });
});

describe("ScopeGuard — 403 SCOPE_NOT_ALLOWED", () => {
  function service(profession: Profession | null, role: UserRole = UserRole.PHYSICIAN) {
    const prisma = {
      user: { findUnique: async () => ({ profession, role, additionalRoles: [], tenant: { market: { code: "EG", clinicalConfig: {} } } }) },
    };
    return new ScopeOfPracticeService(prisma as never);
  }
  function ctx(capability: ScopeCapability | undefined, user: { userId: string } | undefined) {
    class C {
      h() {}
    }
    if (capability) RequiresScope(capability)(C.prototype, "h", Object.getOwnPropertyDescriptor(C.prototype, "h")!);
    return { getHandler: () => C.prototype.h, getClass: () => C, switchToHttp: () => ({ getRequest: () => ({ user }) }) };
  }

  it("physio and nurse get 403 { code: SCOPE_NOT_ALLOWED, capability, profession } on rx.prescribe", async () => {
    for (const p of [Profession.PHYSIOTHERAPIST, Profession.NURSE]) {
      const guard = new ScopeGuard(new Reflector(), service(p));
      await assert.rejects(guard.canActivate(ctx("rx.prescribe", { userId: "u" }) as never), (e: ScopeNotAllowedException) => {
        assert.equal(e.getStatus(), 403);
        const body = e.getResponse() as { code: string; capability: string; profession: string; messageAr: string };
        assert.deepEqual([body.code, body.capability, body.profession], [SCOPE_NOT_ALLOWED, "rx.prescribe", p]);
        assert.ok(body.messageAr);
        return true;
      });
    }
  });

  it("physician and dentist pass; undecorated handlers pass; unscoped admins pass", async () => {
    for (const p of [Profession.PHYSICIAN, Profession.DENTIST]) {
      assert.equal(await new ScopeGuard(new Reflector(), service(p)).canActivate(ctx("rx.prescribe", { userId: "u" }) as never), true);
    }
    assert.equal(await new ScopeGuard(new Reflector(), service(Profession.NURSE)).canActivate(ctx(undefined, { userId: "u" }) as never), true);
    assert.equal(await new ScopeGuard(new Reflector(), service(null, UserRole.CLINIC_ADMIN)).canActivate(ctx("rx.prescribe", { userId: "u" }) as never), true);
  });

  it("assistant cannot sign", async () => {
    const guard = new ScopeGuard(new Reflector(), service(Profession.ASSISTANT, UserRole.RECEPTIONIST));
    await assert.rejects(guard.canActivate(ctx("encounter.sign", { userId: "u" }) as never), ScopeNotAllowedException);
  });
});

describe("ADR-025 scope of practice is never a flag", () => {
  it("scope-of-practice sources do not use feature-flag gating", () => {
    for (const f of listTs(join(SRC, "scope-of-practice"))) {
      const s = readFileSync(f, "utf8");
      assert.ok(!/RequiresFeature\s*\(|FeatureGuard\b|FeatureFlagsService\b|isEnabled\s*\(/.test(s), relative(SRC, f));
    }
  });
});
