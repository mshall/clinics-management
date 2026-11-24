import { Worker } from "node:worker_threads";
import * as bcrypt from "bcryptjs";

/**
 * bcrypt (bcryptjs, pure JS) at cost 10 takes about 50 ms of CPU. `bcrypt.compareSync` in the login path blocked the whole event loop for that long per
 * attempt, so a login burst (e2e suites, crawls, a morning rush) stalled every other request and health probe (measured p95 of /health/live: 750 ms with
 * 18 logins). bcryptjs' own async API still runs on the main thread, so the work is moved to a tiny worker pool here. If workers cannot start (restricted
 * runtime), it degrades to the async bcryptjs call, which at least yields between hashes.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const bcrypt = require(workerData.bcryptPath);
parentPort.on("message", ({ id, op, a, b }) => {
  try { parentPort.postMessage({ id, ok: true, value: op === "compare" ? bcrypt.compareSync(a, b) : bcrypt.hashSync(a, b) }); }
  catch (e) { parentPort.postMessage({ id, ok: false, error: String(e && e.message || e) }); }
});`;

type Job = { resolve: (v: boolean | string) => void; reject: (e: Error) => void };

export class PasswordHasher {
  private workers: Array<{ w: Worker; pending: Map<number, Job> }> = [];
  private seq = 0;
  private broken = false;

  constructor(private readonly size = Math.max(1, Math.min(2, Number(process.env.PASSWORD_HASH_WORKERS) || 2))) {}

  private spawn() {
    const w = new Worker(WORKER_SOURCE, { eval: true, workerData: { bcryptPath: require.resolve("bcryptjs") } });
    const entry = { w, pending: new Map<number, Job>() };
    w.unref();
    w.on("message", (m: { id: number; ok: boolean; value?: boolean | string; error?: string }) => {
      const job = entry.pending.get(m.id); entry.pending.delete(m.id);
      if (job) m.ok ? job.resolve(m.value as boolean | string) : job.reject(new Error(m.error));
    });
    const fail = (e: Error) => { for (const j of entry.pending.values()) j.reject(e); entry.pending.clear(); this.workers = this.workers.filter((x) => x !== entry); };
    w.on("error", fail); w.on("exit", () => fail(new Error("password worker exited")));
    this.workers.push(entry);
    return entry;
  }

  private run(op: "compare" | "hash", a: string, b: string | number): Promise<boolean | string> {
    if (this.broken) return Promise.resolve(op === "compare" ? bcrypt.compare(a, b as string) : bcrypt.hash(a, b as number));
    try {
      const entry = this.workers.length < this.size ? this.spawn() : this.workers.reduce((x, y) => (y.pending.size < x.pending.size ? y : x));
      const id = ++this.seq;
      return new Promise((resolve, reject) => { entry.pending.set(id, { resolve, reject }); entry.w.postMessage({ id, op, a, b }); });
    } catch {
      this.broken = true;
      return this.run(op, a, b);
    }
  }

  async compare(password: string, hash: string | null | undefined): Promise<boolean> {
    if (!hash) return false;
    try { return (await this.run("compare", password, hash)) === true; } catch { return false; }
  }

  async hash(password: string, rounds = 10): Promise<string> { return (await this.run("hash", password, rounds)) as string; }

  async close() { await Promise.all(this.workers.map((e) => e.w.terminate())); this.workers = []; }
}

/** Process-wide instance (workers are unref'd, so they never keep the process alive). */
export const passwordHasher = new PasswordHasher();
