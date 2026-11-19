import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { AwsSecretsManagerAdapter, getSecretsAdapter, setSecretsAdapter } from "./secrets.adapter";
import { getEmailAdapter, setEmailAdapter } from "./email.adapter";

const SRC_ROOT = join(process.cwd(), "src");
const ADAPTERS = join(SRC_ROOT, "platform", "adapters");

function listTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listTs(full, out);
    else if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

const SDK_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']@aws-sdk\//;

describe("KX-21 §01 application adapters", () => {
  it("no @aws-sdk/* import outside src/platform/adapters/*", () => {
    const offenders = listTs(SRC_ROOT)
      .filter((f) => !f.startsWith(ADAPTERS + "/") && !f.endsWith(".node.test.ts"))
      .filter((f) => SDK_RE.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC_ROOT, f));
    assert.deepEqual(offenders, [], `Move AWS SDK usage behind src/platform/adapters/*: ${offenders.join(", ")}`);
  });

  it("detector actually flags a violating snippet", () => {
    assert.ok(SDK_RE.test(`import { X } from "@aws-sdk/client-s3";`));
    assert.ok(SDK_RE.test(`const m = await import("@aws-sdk/client-ses");`));
    assert.ok(!SDK_RE.test(`import { y } from "./platform/adapters";`));
  });

  it("secrets and email adapters are swappable (cloud-switch seam)", async () => {
    const prevS = getSecretsAdapter();
    setSecretsAdapter({ getSecret: async (ref) => `secret:${ref}` });
    assert.equal(await getSecretsAdapter().getSecret("x"), "secret:x");
    setSecretsAdapter(prevS);
    assert.ok(prevS instanceof AwsSecretsManagerAdapter);

    const prevE = getEmailAdapter();
    setEmailAdapter({ send: async () => ({ messageId: "m1" }) });
    assert.deepEqual(
      await getEmailAdapter().send({ fromAddress: "a@b.c", region: "r", to: "t@b.c", subject: "s", text: "t", html: "h" }),
      { messageId: "m1" },
    );
    setEmailAdapter(prevE);
  });
});
