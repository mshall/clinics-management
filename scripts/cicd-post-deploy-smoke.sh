#!/usr/bin/env bash
# After CDK deploy: wait for CloudFront → App Runner, then verify health + demo login.
set -euo pipefail

STACK_NAME="${STACK_NAME:-kiorly-clinics-management}"
REGION="${AWS_REGION:-eu-central-1}"
DEMO_EMAIL="${SMOKE_LOGIN_EMAIL:-admin@drahmedshall.com}"
DEMO_PASSWORD="${SMOKE_LOGIN_PASSWORD:-demo}"
HEALTH_ATTEMPTS="${SMOKE_HEALTH_ATTEMPTS:-36}"
HEALTH_SLEEP_SEC="${SMOKE_HEALTH_SLEEP_SEC:-10}"

APP_URL="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='AppUrl'].OutputValue" \
  --output text 2>/dev/null || true)"

if [[ -z "$APP_URL" || "$APP_URL" == "None" ]]; then
  echo "::error::Could not read AppUrl output from stack $STACK_NAME"
  exit 1
fi

APP_URL="${APP_URL%/}"
echo "Post-deploy smoke: $APP_URL"

health_ok=false
for i in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if curl -sf "$APP_URL/api/v1/health/live" >/dev/null 2>&1; then
    echo "OK  GET /api/v1/health/live"
    health_ok=true
    break
  fi
  echo "Waiting for API health ($i/$HEALTH_ATTEMPTS)..."
  sleep "$HEALTH_SLEEP_SEC"
done

if [[ "$health_ok" != true ]]; then
  echo "::error::API health check did not pass within $((HEALTH_ATTEMPTS * HEALTH_SLEEP_SEC))s"
  exit 1
fi

login_raw="$(curl -sS -w "\n%{http_code}" -X POST "$APP_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"$DEMO_PASSWORD\"}")"
http_code="$(echo "$login_raw" | tail -1)"
body="$(echo "$login_raw" | sed '$d')"

if [[ "$http_code" != "200" && "$http_code" != "201" ]]; then
  echo "::error::Login smoke failed HTTP $http_code"
  echo "$body" | head -c 2000
  exit 1
fi

if ! echo "$body" | grep -q '"accessToken"'; then
  echo "::error::Login response missing accessToken (possible SPA/HTML mis-route)"
  echo "$body" | head -c 2000
  exit 1
fi

echo "OK  POST /api/v1/auth/login ($DEMO_EMAIL)"
