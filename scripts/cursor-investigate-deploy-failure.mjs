#!/usr/bin/env node
/**
 * GitHub Actions: after a failed AWS deploy, run Cursor (cloud by default) to analyze
 * diagnostics and open a PR with fixes. Requires CURSOR_API_KEY and GITHUB_TOKEN with
 * contents:write + pull-requests:write (see workflow job permissions).
 * @see https://cursor.com/docs/sdk/typescript
 */
import fs from "node:fs";
import { Agent } from "@cursor/sdk";

const apiKey = process.env.CURSOR_API_KEY?.trim();
if (!apiKey) {
  console.log("::notice::CURSOR_API_KEY not set — skipping Cursor SDK post-mortem.");
  process.exit(0);
}

/** Prefer fine-grained/classic PAT in secret CURSOR_CLOUD_GITHUB_TOKEN if org blocks `github.token` pushes. */
const ghToken = (process.env.CURSOR_CLOUD_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "").trim();
const useLocal = process.env.CURSOR_SDK_RUNTIME === "local";

if (!useLocal && !ghToken) {
  console.log("::notice::No GitHub token — skipping cloud agent (set job permissions + GITHUB_TOKEN or CURSOR_CLOUD_GITHUB_TOKEN, or CURSOR_SDK_RUNTIME=local).");
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

function repoCloneUrl() {
  const explicit = process.env.CURSOR_CLOUD_REPO_URL?.trim();
  if (explicit) return explicit;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    throw new Error("GITHUB_REPOSITORY is required for cloud agent (e.g. owner/repo)");
  }
  return `https://github.com/${repo}.git`;
}

function startingRef() {
  return (
    process.env.GITHUB_REF_NAME?.trim() ||
    process.env.GITHUB_HEAD_REF?.trim() ||
    "main"
  );
}

const prompt = `The GitHub Action "Deploy to AWS" (CDK) just failed — often AWS::AppRunner::Service NotStabilized.

The bundle below is the **authoritative** evidence (you do **not** have live AWS API access from this agent). It includes, when available:
- **App Runner describe-service** + **list-operations** JSON (status / failures),
- **CloudWatch** for \`/aws/apprunner/...\` (**aws logs tail**, plus expanded groups matching the service id),
- Lambda + RDS log prefixes,
- **FULL DEPLOY JOB LOG** (bash -x + CDK \`--verbose\` / Docker build + cdk deploy).

--- DIAGNOSTICS ---
${diagnostics.slice(0, 220_000)}
--- END DIAGNOSTICS ---

**You must:** (1) locate **application stderr** / Nest / Node stack traces and lines prefixed \`[boot]\` in the App Runner sections; (2) quote the **smallest verbatim snippets** that prove the root cause; (3) **implement** the minimal repo fix (Dockerfile, \`apps/api/docker-entrypoint.mjs\`, \`apps/api/src\`, \`infra/src\`, health/migrate/env).

**Requirements:**
- Commit with a message like \`fix(aws): address App Runner failure from CI diagnostics\`.
- In the PR body, lead with **Root cause (from logs):** citing the quoted lines.
- If application logs are empty (service torn down too fast), say so and rely on **FULL DEPLOY JOB LOG** + describe-service / operations JSON.

A pull request will be created automatically when you finish (\`autoCreatePR\`).`;

const agentOptionsBase = { apiKey };

try {
  let result;

  if (useLocal) {
    result = await Agent.prompt(prompt, {
      ...agentOptionsBase,
      model: { id: "composer-2" },
      local: { cwd: process.cwd(), settingSources: [] },
    });
  } else {
    const url = repoCloneUrl();
    const ref = startingRef();
    console.log(`::notice::Cursor cloud agent: repo=${url} ref=${ref} autoCreatePR=true`);
    result = await Agent.prompt(prompt, {
      ...agentOptionsBase,
      model: { id: "composer-2" },
      cloud: {
        repos: [{ url, startingRef: ref }],
        autoCreatePR: true,
        skipReviewerRequest: true,
        envVars: {
          GITHUB_TOKEN: ghToken,
          GH_TOKEN: ghToken,
        },
      },
    });
  }

  const prHint =
    result.git?.branches?.map((b) => b.prUrl).filter(Boolean)[0] ||
    result.result?.match(/https:\/\/github\.com\/[^)\s]+\/pull\/\d+/)?.[0] ||
    "_check Cursor dashboard / repo Pull requests_";

  const body = `## Cursor SDK deploy post-mortem

**Run status:** \`${result.status}\`
**PR / link:** ${prHint}

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
