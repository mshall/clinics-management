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

access_token="$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")"

admin_raw="$(curl -sS -w "\n%{http_code}" -X GET "$APP_URL/api/v1/admin/users?page=1&pageSize=5" \
  -H "Authorization: Bearer $access_token" \
  -H "Accept: application/json")"
admin_http="$(echo "$admin_raw" | tail -1)"
admin_body="$(echo "$admin_raw" | sed '$d')"

if [[ "$admin_http" == "404" ]]; then
  echo "::error::GET /api/v1/admin/users returned 404 — App Runner may be on a stale rolled-back API image"
  exit 1
fi

if [[ "$admin_http" != "200" ]]; then
  echo "::error::Organization users smoke failed HTTP $admin_http"
  echo "$admin_body" | head -c 2000
  exit 1
fi

admin_total="$(echo "$admin_body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo 0)"
if [[ "${admin_http}" == "200" && "${admin_total:-0}" -lt 3 ]]; then
  echo "WARN  Seeded org users still populating (total=$admin_total) — waiting for background seed …"
  for i in $(seq 1 18); do
    sleep 10
    admin_raw="$(curl -sS -w "\n%{http_code}" -X GET "$APP_URL/api/v1/admin/users?page=1&pageSize=5" \
      -H "Authorization: Bearer $access_token" \
      -H "Accept: application/json")"
    admin_http="$(echo "$admin_raw" | tail -1)"
    admin_body="$(echo "$admin_raw" | sed '$d')"
    admin_total="$(echo "$admin_body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo 0)"
    if [[ "${admin_total:-0}" -ge 3 ]]; then
      break
    fi
    echo "  seed wait ($i/18) total=$admin_total"
  done
fi

if [[ "${admin_total:-0}" -lt 3 ]]; then
  echo "::error::Expected seeded org users (total=$admin_total) — incremental seed may not have run"
  exit 1
fi

echo "OK  GET /api/v1/admin/users (total=$admin_total org users)"
