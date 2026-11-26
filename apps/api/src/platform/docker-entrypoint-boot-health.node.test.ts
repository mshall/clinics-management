import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

/**
 * Dry-run risk R3: a failed migration must not look healthy. The real entrypoint runs here on a private ephemeral port with
 * a fake `npx` first on PATH (no database, no Prisma). Only the PIDs started here are killed.
 */
const apiRoot = process.cwd();
const entrypoint = path.join(apiRoot, "docker-entrypoint.mjs");
const dir = mkdtempSync(path.join(tmpdir(), "entrypoint-r3-"));
const children: ChildProcess[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function fakeNpx(body: string): string {
  const bin = path.join(dir, `bin-${Math.random().toString(36).slice(2)}`);
  const file = path.join(bin, "npx");
  mkdirSync(bin, { recursive: true });
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
  return bin;
}

function start(fakeBin: string, port: number): ChildProcess {
  const child = spawn(process.execPath, [entrypoint], {
    cwd: apiRoot,
    stdio: "ignore",
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      PORT: String(port),
      NEST_INTERNAL_PORT: String(port + 1),
      PRISMA_MIGRATE_ON_BOOT: "true",
      PRISMA_MIGRATE_MAX_ATTEMPTS: "2",
      PRISMA_MIGRATE_RETRY_DELAY_MS: "10",
    },
  });
  children.push(child);
  return child;
}

async function live(port: number): Promise<{ status: number; body: { status?: string; phase?: string } }> {
  const res = await fetch(`http://127.0.0.1:${port}/api/v1/health/live`);
  return { status: res.status, body: (await res.json()) as { status?: string; phase?: string } };
}

async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 15_000): Promise<T> {
  const end = Date.now() + ms;
  let last: T | undefined;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (ok(last)) return last;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out; last=${JSON.stringify(last)}`);
}

after(() => {
  for (const c of children) if (c.pid && c.exitCode === null) c.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
});

describe("entrypoint health during and after migration (R3)", () => {
  it("answers 200 while a migration is still running", async () => {
    const port = await freePort();
    start(fakeNpx("sleep 30"), port);
    const r = await waitFor(() => live(port), (v) => v.status === 200);
    assert.equal(r.body.phase, "starting");
  });

  it("answers 503 boot_failed once migrations have failed every bounded attempt", async () => {
    const port = await freePort();
    start(fakeNpx("exit 1"), port);
    const r = await waitFor(() => live(port), (v) => v.status === 503);
    assert.equal(r.body.status, "boot_failed");
    // stays unhealthy: no endless retry loop turns it back to 200
    await new Promise((res) => setTimeout(res, 300));
    assert.equal((await live(port)).status, 503);
  });
});
