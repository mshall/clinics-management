#!/usr/bin/env bash
# Local smoke: staff JWT + integration bearer appointment flows.
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3000/api/v1}"
ADMIN_EMAIL="${SMOKE_LOGIN_EMAIL:-admin@drahmedshall.com}"
ADMIN_PASSWORD="${SMOKE_LOGIN_PASSWORD:-demo}"

fail() {
  echo "integration-api-smoke: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

require_cmd curl
require_cmd python3

echo "Smoke target: $API_BASE"

ready="$(curl -sS "$API_BASE/health/ready" || true)"
if echo "$ready" | grep -q '"database":"ok"'; then
  echo "OK  database ready"
else
  fail "database not ready — start Postgres and run: npm run db:setup (response: $ready)"
fi

login_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")"
login_http="$(echo "$login_raw" | tail -1)"
login_body="$(echo "$login_raw" | sed '$d')"
[[ "$login_http" == "200" || "$login_http" == "201" ]] || fail "staff login HTTP $login_http"
staff_token="$(echo "$login_body" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")"
echo "OK  staff login"

client_name="smoke-$(date +%s)"
create_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/admin/integration-clients" \
  -H "Authorization: Bearer $staff_token" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$client_name\"}")"
create_http="$(echo "$create_raw" | tail -1)"
create_body="$(echo "$create_raw" | sed '$d')"
[[ "$create_http" == "201" || "$create_http" == "200" ]] || fail "create integration client HTTP $create_http — $create_body"
integration_token="$(echo "$create_body" | python3 -c "import sys,json; print(json.load(sys.stdin)['bearerToken'])")"
echo "OK  create integration client"

verify_http="$(curl -sS -o /tmp/kio-verify.json -w "%{http_code}" -X GET "$API_BASE/integrations/auth/verify" \
  -H "Authorization: Bearer $integration_token")"
[[ "$verify_http" == "200" ]] || fail "integration verify HTTP $verify_http"
echo "OK  integration verify"

clinics_body="$(curl -sS -X GET "$API_BASE/integrations/clinics" -H "Authorization: Bearer $integration_token")"
clinic_id="$(echo "$clinics_body" | python3 -c "import sys,json; items=json.load(sys.stdin).get('items',[]); print(items[0]['id'] if items else '')")"
[[ -n "$clinic_id" ]] || fail "no clinics returned for integration client"

physicians_body="$(curl -sS -X GET "$API_BASE/integrations/physicians?clinicId=$clinic_id" \
  -H "Authorization: Bearer $integration_token")"
clinician_id="$(echo "$physicians_body" | python3 -c "import sys,json; items=json.load(sys.stdin).get('items',[]); print(items[0]['id'] if items else '')")"
[[ -n "$clinician_id" ]] || fail "no physicians for clinic $clinic_id"

patients_raw="$(curl -sS -w "\n%{http_code}" -X GET "$API_BASE/patients?page=1&pageSize=1&clinicId=$clinic_id" \
  -H "Authorization: Bearer $staff_token")"
patients_http="$(echo "$patients_raw" | tail -1)"
patients_body="$(echo "$patients_raw" | sed '$d')"
[[ "$patients_http" == "200" ]] || fail "staff patients list HTTP $patients_http"
patient_id="$(echo "$patients_body" | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('items', d.get('data', [])); print(items[0]['id'] if items else '')" 2>/dev/null || true)"
[[ -n "$patient_id" ]] || fail "need at least one patient in clinic for booking smoke"

starts_at="$(python3 -c "from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc)+timedelta(days=14)).replace(hour=10,minute=0,second=0,microsecond=0).isoformat().replace('+00:00','Z'))")"
ext_ref="smoke-$(date +%s)"

book_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/integrations/appointments" \
  -H "Authorization: Bearer $integration_token" \
  -H "Content-Type: application/json" \
  -d "{\"clinicId\":\"$clinic_id\",\"patientId\":\"$patient_id\",\"clinicianId\":\"$clinician_id\",\"startsAt\":\"$starts_at\",\"externalReference\":\"$ext_ref\"}")"
book_http="$(echo "$book_raw" | tail -1)"
book_body="$(echo "$book_raw" | sed '$d')"
[[ "$book_http" == "201" || "$book_http" == "200" ]] || fail "integration book HTTP $book_http — $book_body"
appt_id="$(echo "$book_body" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")"
echo "OK  integration book appointment $appt_id"

book_dup_http="$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$API_BASE/integrations/appointments" \
  -H "Authorization: Bearer $integration_token" \
  -H "Content-Type: application/json" \
  -d "{\"clinicId\":\"$clinic_id\",\"patientId\":\"$patient_id\",\"clinicianId\":\"$clinician_id\",\"startsAt\":\"$starts_at\",\"externalReference\":\"$ext_ref\"}")"
[[ "$book_dup_http" == "200" || "$book_dup_http" == "201" ]] || fail "idempotent re-book HTTP $book_dup_http"
echo "OK  integration idempotent externalReference"

get_http="$(curl -sS -o /dev/null -w "%{http_code}" -X GET "$API_BASE/integrations/appointments/$appt_id" \
  -H "Authorization: Bearer $integration_token")"
[[ "$get_http" == "200" ]] || fail "integration get HTTP $get_http"
echo "OK  integration get appointment"

cancel_http="$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$API_BASE/integrations/appointments/$appt_id/cancel" \
  -H "Authorization: Bearer $integration_token")"
[[ "$cancel_http" == "200" || "$cancel_http" == "201" ]] || fail "integration cancel HTTP $cancel_http"
echo "OK  integration cancel appointment"

staff_starts="$(python3 -c "from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc)+timedelta(days=15)).replace(hour=11,minute=0,second=0,microsecond=0).isoformat().replace('+00:00','Z'))")"
staff_book_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/appointments" \
  -H "Authorization: Bearer $staff_token" \
  -H "Content-Type: application/json" \
  -d "{\"clinicId\":\"$clinic_id\",\"patientId\":\"$patient_id\",\"clinicianId\":\"$clinician_id\",\"startsAt\":\"$staff_starts\",\"confirmOverlap\":true}")"
staff_book_http="$(echo "$staff_book_raw" | tail -1)"
[[ "$staff_book_http" == "201" || "$staff_book_http" == "200" ]] || fail "staff POST /appointments HTTP $staff_book_http"
echo "OK  staff internal appointment book"

echo "integration-api-smoke: all checks passed"
