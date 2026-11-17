#!/usr/bin/env bash
# Deploy a Kiorly platform cell (SC-01). Defaults: frankfurt / eu-central-1.
# Egypt in-region pilot: KIORLY_HOST_CELL=cairo AWS_REGION=me-south-1 bash scripts/deploy-aws.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST_CELL="${KIORLY_HOST_CELL:-frankfurt}"
CELL_REGION="$(node -e "
const fs=require('fs');
const p='${ROOT}/platform/data-cells.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
const c=j.cells['${HOST_CELL}'];
if(!c){console.error('Unknown KIORLY_HOST_CELL');process.exit(1);}
process.stdout.write(c.awsRegion);
")"
export AWS_REGION="${AWS_REGION:-$CELL_REGION}"
export CDK_DEFAULT_REGION="${CDK_DEFAULT_REGION:-$AWS_REGION}"
export CDK_DEFAULT_ACCOUNT
CDK_DEFAULT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
cd "$ROOT"
npm ci --no-audit --no-fund
npm run build -w web
cd infra
npm ci --no-audit --no-fund
npm run build
npx cdk bootstrap "aws://${CDK_DEFAULT_ACCOUNT}/${CDK_DEFAULT_REGION}"
npx cdk deploy -c "hostCell=${HOST_CELL}" -c "deployRegion=${CDK_DEFAULT_REGION}" --require-approval never
