#!/usr/bin/env node
/**
 * Optional GitHub Actions step: send AWS deploy diagnostics to Cursor via the TypeScript SDK
 * (local runtime over the checked-out repo). Requires CURSOR_API_KEY repository secret.
 * @see https://cursor.com/docs/api/sdk/typescript
 */
import fs from "node:fs";
import { Agent } from "@cursor/sdk";

const apiKey = process.env.CURSOR_API_KEY?.trim();
if (!apiKey) {
  console.log("::notice::CURSOR_API_KEY not set — skipping Cursor SDK post-mortem.");
  process.exit(0);
}

const logPath = process.env.DIAGNOSTICS_LOG || "diagnostics.log";
let diagnostics = "(missing diagnostics.log — artifact or collect step may have failed)";
try {
  diagnostics = fs.readFileSync(logPath, "utf8");
} catch {
  /* keep default */
}

function appendSummary(md) {
  const p = process.env.GITHUB_STEP_SUMMARY;
  if (p) fs.appendFileSync(p, `${md}\n`);
}

const prompt = `The GitHub Action "Deploy to AWS" (CDK) just failed — often AWS::AppRunner::Service NotStabilized.

The repository is checked out at the process working directory. Use only files that exist here.

Below is automated AWS diagnostics (CloudFormation events + App Runner log snippets where available):

--- DIAGNOSTICS ---
${diagnostics.slice(0, 100_000)}
--- END DIAGNOSTICS ---

Reply for a staff engineer:
1) Most likely root causes (ordered, max 5 bullets).
2) Exact repo paths to open or change (e.g. apps/api/Dockerfile, infra/src/..., docker-entrypoint.mjs).
3) Minimal concrete fixes (code/config snippets). If data is insufficient, say exactly what to fetch next from AWS (log group names, App Runner service id, etc.).
Do not invent AWS resource names not present in the diagnostics.`;

try {
  const result = await Agent.prompt(prompt, {
    apiKey,
    model: { id: "composer-2" },
    local: { cwd: process.cwd(), settingSources: [] },
  });

  const body = `## Cursor SDK deploy post-mortem

**Run status:** \`${result.status}\`

${result.result ?? "_no assistant text in result.result_"}
`;
  console.log(body);
  appendSummary(body);

  if (result.status !== "finished") {
    console.log(`::warning::Cursor run ended with status=${result.status}`);
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.log(`::warning::Cursor SDK error (non-fatal): ${msg}`);
  appendSummary(`## Cursor SDK deploy post-mortem\n\n_Skipped or error:_ ${msg}\n`);
}

process.exit(0);
