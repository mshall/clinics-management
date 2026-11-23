#!/usr/bin/env bash
# ADR-039 telehealth: create the Cloudflare Realtime TURN key `kiorly-clinic-<env>` and store {"turnKeyId","apiToken"} in
# AWS Secrets Manager at /kiorly-clinic/<env>/cloudflare-turn (the EMPTY container is created by OpenTofu).
#
#   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... scripts/setup-telehealth-turn.sh <env> [--rotate] [--profile <aws-profile>] [--region <r>]
#
# - Cloudflare credentials are read from the SHELL ENVIRONMENT only (never argv, never files). The API token needs account-scoped
#   "Calls Write" (Realtime) permission; discard it afterwards.
# - Secrets travel by stdin/pipes only: no temp files, no `set -x`, nothing secret is printed. Output = success + secret ARN.
# - Idempotent: does nothing when the secret already holds a key, unless --rotate (then the old Cloudflare key is deleted after the swap).
set -euo pipefail
set +x

ENV_NAME="${1:-}"
[ -n "$ENV_NAME" ] || { echo "usage: $0 <env> [--rotate] [--profile <aws-profile>] [--region <region>]" >&2; exit 2; }
shift
case "$ENV_NAME" in *[!a-z0-9-]*|"") echo "env must match [a-z0-9-]+" >&2; exit 2;; esac

ROTATE=0
REGION="${AWS_REGION:-eu-central-1}"
PROFILE_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --rotate) ROTATE=1;;
    --profile) shift; PROFILE_ARGS=(--profile "${1:?--profile needs a value}");;
    --region) shift; REGION="${1:?--region needs a value}";;
    *) echo "unknown argument: $1" >&2; exit 2;;
  esac
  shift
done

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] || [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be exported in the shell (account-scoped token with 'Calls Write' / Realtime)." >&2
  echo "Nothing was changed." >&2
  exit 3
fi
for bin in aws curl python3; do command -v "$bin" >/dev/null || { echo "missing dependency: $bin" >&2; exit 4; }; done

SECRET_ID="/kiorly-clinic/${ENV_NAME}/cloudflare-turn"
KEY_NAME="kiorly-clinic-${ENV_NAME}"
CF_API="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/calls/turn_keys"
aws_sm() { aws "${PROFILE_ARGS[@]}" --region "$REGION" secretsmanager "$@"; }
# The bearer header goes to curl through stdin (--config -), so the token never appears in the process list.
cf() { printf 'header = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n' "$CLOUDFLARE_API_TOKEN" | curl -sS --fail-with-body --config - "$@"; }

# Current state (value is parsed in a pipe, only a verdict + the old key id leave it).
EXISTING_JSON="$(aws_sm get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text 2>/dev/null || true)"
OLD_KEY_ID="$(printf '%s' "$EXISTING_JSON" | python3 -c 'import sys,json
try:
    print(json.loads(sys.stdin.read()).get("turnKeyId",""))
except Exception:
    print("")')"
if [ -n "$OLD_KEY_ID" ] && [ "$ROTATE" -eq 0 ]; then
  ARN="$(aws_sm describe-secret --secret-id "$SECRET_ID" --query ARN --output text)"
  echo "OK (unchanged): ${SECRET_ID} already holds a TURN key. Use --rotate to replace it."
  echo "ARN: ${ARN}"
  exit 0
fi
unset EXISTING_JSON

# Create the key and pipe {"turnKeyId","apiToken"} straight into Secrets Manager.
printf '{"name":"%s"}' "$KEY_NAME" \
  | cf -X POST "$CF_API" --data @- \
  | python3 -c 'import sys,json
r = json.load(sys.stdin)
res = r.get("result") or {}
if not r.get("success") or not res.get("uid") or not res.get("secret"):
    sys.stderr.write("Cloudflare did not return a TURN key (check the token permission).\n")
    sys.exit(1)
sys.stdout.write(json.dumps({"turnKeyId": res["uid"], "apiToken": res["secret"]}))' \
  | aws_sm put-secret-value --secret-id "$SECRET_ID" --secret-string file:///dev/stdin --query ARN --output text > /dev/null

if [ "$ROTATE" -eq 1 ] && [ -n "$OLD_KEY_ID" ]; then
  cf -X DELETE "${CF_API}/${OLD_KEY_ID}" > /dev/null || echo "note: could not delete the previous Cloudflare key (delete it in the dashboard)." >&2
fi

ARN="$(aws_sm describe-secret --secret-id "$SECRET_ID" --query ARN --output text)"
echo "OK: TURN key ${KEY_NAME} stored."
echo "ARN: ${ARN}"
