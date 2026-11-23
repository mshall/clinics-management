import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ValidationPipe } from "@nestjs/common";
import { KiorexBackchannelDto, KiorexCallbackDto, KiorexCompleteDto, KiorexPasswordDto } from "./dto/kiorex-oidc.dto";

/** The Passport bodies are decorated classes (validated by the global whitelist pipe, unknown fields refused). */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

describe("Kiorex Passport body DTOs survive the global ValidationPipe", () => {
  it("the controller source types every body with a DTO class (tsx does not emit decorator metadata, so check the source)", () => {
    const src = readFileSync(join(__dirname, "kiorex-oidc.controller.ts"), "utf8");
    assert.equal(/@Body\(\)\s+body:\s*\{/.test(src), false, "inline body type");
  });
  it("code/state/iss, ticket/mfaCode, password and logout_token are kept; unknown fields are refused", async () => {
    const t = (v: unknown, metatype: unknown) => pipe.transform(v, { type: "body", metatype: metatype as never });
    assert.deepEqual({ ...(await t({ code: "c", state: "s", iss: "i" }, KiorexCallbackDto)) }, { code: "c", state: "s", iss: "i" });
    assert.deepEqual({ ...(await t({ ticket: "t", mfaCode: "123456" }, KiorexCompleteDto)) }, { ticket: "t", mfaCode: "123456" });
    assert.deepEqual({ ...(await t({ password: "p" }, KiorexPasswordDto)) }, { password: "p" });
    assert.deepEqual({ ...(await t({ logout_token: "x.y.z" }, KiorexBackchannelDto)) }, { logout_token: "x.y.z" });
    await assert.rejects(t({ code: "c", evil: 1 }, KiorexCallbackDto));
  });
});
