import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prismaClientFault } from "./prisma-exception.filter";

describe("EDGE-49 Prisma client faults are 4xx, server faults stay 500", () => {
  it("maps validation, not-found, duplicate, foreign key and malformed values", () => {
    assert.equal(prismaClientFault({ name: "PrismaClientValidationError" })?.status, 400);
    assert.equal(prismaClientFault({ code: "P2025" })?.status, 404);
    assert.equal(prismaClientFault({ code: "P2002" })?.status, 409);
    assert.equal(prismaClientFault({ code: "P2003" })?.status, 409);
    for (const c of ["P2000", "P2006", "P2020", "P2023"]) assert.equal(prismaClientFault({ code: c })?.status, 400, c);
  });
  it("leaves connection, pool, schema and unknown errors alone", () => {
    for (const e of [{ code: "P1001" }, { code: "P2024" }, { code: "P2021" }, { name: "Error" }, {}]) assert.equal(prismaClientFault(e), null);
  });
});
