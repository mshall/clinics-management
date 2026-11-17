import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const MIGRATIONS = join(process.cwd(), "prisma/migrations");

function migrationRank(name: string): number {
  const m = /^(\d+)_/.exec(name);
  return m ? Number(m[1]) : 0;
}

describe("Prisma migration order", () => {
  it("MS-01 runs after clinic platform wave (OutboundMessage)", () => {
    const dirs = readdirSync(MIGRATIONS).filter((d) => !d.startsWith("."));
    const ms01 = dirs.find((d) => d.includes("ms01_whatsapp_outbound"));
    const wave = dirs.find((d) => d.includes("clinic_platform_wave"));
    assert.ok(ms01 && wave);
    assert.ok(
      migrationRank(ms01) > migrationRank(wave),
      `${ms01} must sort after ${wave} on fresh CI databases`,
    );
  });

  it("CL-02 runs after clinical workflows (DrugInteractionRule)", () => {
    const dirs = readdirSync(MIGRATIONS).filter((d) => !d.startsWith("."));
    const cl02 = dirs.find((d) => d.includes("cl02_rx_safety"));
    const clinical = dirs.find((d) => d.includes("clinical_workflows"));
    assert.ok(cl02 && clinical);
    assert.ok(migrationRank(cl02) > migrationRank(clinical));
  });

  it("MS-03 runs after clinic platform wave (MessageChannel enum)", () => {
    const dirs = readdirSync(MIGRATIONS).filter((d) => !d.startsWith("."));
    const ms03 = dirs.find((d) => d.includes("ms03_messaging_consent"));
    const wave = dirs.find((d) => d.includes("clinic_platform_wave"));
    assert.ok(ms03 && wave);
    assert.ok(migrationRank(ms03) > migrationRank(wave));
  });

  it("MS-02 runs after Market table exists (whatsapp market config)", () => {
    const dirs = readdirSync(MIGRATIONS).filter((d) => !d.startsWith("."));
    const ms02 = dirs.find((d) => d.includes("ms02_whatsapp_inbound"));
    const markets = dirs.find((d) => d.includes("markets_fiscal_providers"));
    assert.ok(ms02 && markets);
    assert.ok(migrationRank(ms02) > migrationRank(markets));
  });
});