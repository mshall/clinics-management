#!/usr/bin/env bash
# Local smoke: staff JWT + integration bearer appointment flows.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/local-dev-ports.sh
source "$ROOT/scripts/local-dev-ports.sh"
API_BASE="${API_BASE:-http://localhost:${API_PORT}/api/v1}"
# Credentials: no published default for a deployed target. Only a LOCAL API (localhost / 127.0.0.1, seeded by
# `npm run db:setup`) falls back to the local-dev seed login; anything else needs SMOKE_LOGIN_EMAIL and SMOKE_LOGIN_PASSWORD.
case "$API_BASE" in
  http://localhost:*|http://127.0.0.1:*|http://localhost/*|http://127.0.0.1/*)
    ADMIN_EMAIL="${SMOKE_LOGIN_EMAIL:-admin@drahmedshall.com}"
    ADMIN_PASSWORD="${SMOKE_LOGIN_PASSWORD:-demo}" # local-dev seed only
    ;;
  *)
    if [[ -z "${SMOKE_LOGIN_EMAIL:-}" || -z "${SMOKE_LOGIN_PASSWORD:-}" ]]; then
      echo "integration-api-smoke: SMOKE_LOGIN_EMAIL and SMOKE_LOGIN_PASSWORD must be set for a non-local API_BASE (no published default)." >&2
      exit 1
    fi
    ADMIN_EMAIL="$SMOKE_LOGIN_EMAIL"
    ADMIN_PASSWORD="$SMOKE_LOGIN_PASSWORD"
    ;;
esac

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

appt_list="$(curl -sS -X GET "$API_BASE/appointments?page=1&pageSize=20&status=CONFIRMED" -H "Authorization: Bearer $staff_token")"
appt_id="$(echo "$appt_list" | python3 -c "import sys,json; items=json.load(sys.stdin).get('items') or []; print(next((a['id'] for a in items if a.get('status')=='CONFIRMED'), ''))")"
if [[ -n "$appt_id" ]]; then
  checkin_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/front-desk/appointments/$appt_id/check-in" \
    -H "Authorization: Bearer $staff_token" -H "Content-Type: application/json" -d '{}')"
  checkin_http="$(echo "$checkin_raw" | tail -1)"
  checkin_body="$(echo "$checkin_raw" | sed '$d')"
  [[ "$checkin_http" == "200" || "$checkin_http" == "201" ]] || fail "front-desk check-in HTTP $checkin_http — $checkin_body"
  echo "$checkin_body" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('openEncounterId'), d" || fail "check-in missing openEncounterId"
  appt_get="$(curl -sS -X GET "$API_BASE/appointments/$appt_id" -H "Authorization: Bearer $staff_token")"
  echo "$appt_get" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('status')=='CHECKED_IN' and d.get('openEncounterId'), d" || fail "GET appointment missing openEncounterId after check-in"
  echo "OK  check-in creates draft encounter (openEncounterId)"
else
  echo "SKIP check-in smoke (no CONFIRMED appointment)"
fi

assistant_ctx_http="$(curl -sS -o /tmp/kio-assistant-ctx.json -w "%{http_code}" -X GET "$API_BASE/assistant/context?locale=en" \
  -H "Authorization: Bearer $staff_token")"
[[ "$assistant_ctx_http" == "200" ]] || fail "assistant context HTTP $assistant_ctx_http (restart API after pulling assistant changes)"
echo "OK  assistant context"

assistant_chat_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/assistant/chat" \
  -H "Authorization: Bearer $staff_token" \
  -H "Content-Type: application/json" \
  -d '{"message":"hello","locale":"en"}')"
assistant_chat_http="$(echo "$assistant_chat_raw" | tail -1)"
assistant_chat_body="$(echo "$assistant_chat_raw" | sed '$d')"
[[ "$assistant_chat_http" == "200" || "$assistant_chat_http" == "201" ]] || fail "assistant chat HTTP $assistant_chat_http — $assistant_chat_body"
echo "$assistant_chat_body" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('reply'), 'missing reply'" || fail "assistant chat missing reply"
echo "OK  assistant chat"

clinic_list_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/assistant/chat" \
  -H "Authorization: Bearer $staff_token" \
  -H "Content-Type: application/json" \
  -d '{"message":"What are the list of clinics in this org?","locale":"en"}')"
clinic_list_http="$(echo "$clinic_list_raw" | tail -1)"
clinic_list_body="$(echo "$clinic_list_raw" | sed '$d')"
[[ "$clinic_list_http" == "200" || "$clinic_list_http" == "201" ]] || fail "assistant clinic list HTTP $clinic_list_http"
echo "$clinic_list_body" | python3 -c "import sys,json; r=json.load(sys.stdin).get('reply',''); assert len(r)>20 and ('clinic' in r.lower() or '1.' in r), r[:240]" || fail "assistant clinic list reply empty"
echo "OK  assistant clinic list"

revenue_q_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/assistant/chat" \
  -H "Authorization: Bearer $staff_token" \
  -H "Content-Type: application/json" \
  -d '{"message":"What is the revenue for this org this month?","locale":"en"}')"
revenue_q_http="$(echo "$revenue_q_raw" | tail -1)"
revenue_q_body="$(echo "$revenue_q_raw" | sed '$d')"
[[ "$revenue_q_http" == "200" || "$revenue_q_http" == "201" ]] || fail "assistant revenue HTTP $revenue_q_http"
echo "$revenue_q_body" | python3 -c "import sys,json; r=json.load(sys.stdin).get('reply',''); assert 'revenue' in r.lower() or 'net' in r.lower() or 'AED' in r or 'EGP' in r, r[:280]" || fail "assistant revenue reply missing totals"
echo "OK  assistant revenue query"

emp_q_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/assistant/chat" \
  -H "Authorization: Bearer $staff_token" -H "Content-Type: application/json" \
  -d '{"message":"how many employees do we have in the organization?","locale":"en"}')"
emp_q_http="$(echo "$emp_q_raw" | tail -1)"
emp_q_body="$(echo "$emp_q_raw" | sed '$d')"
[[ "$emp_q_http" == "200" || "$emp_q_http" == "201" ]] || fail "assistant employee count HTTP $emp_q_http"
echo "$emp_q_body" | python3 -c "import sys,json,re; r=json.load(sys.stdin).get('reply',''); assert re.search(r'Active employees|employee', r, re.I) and re.search(r'\d+', r), r[:280]" || fail "assistant employee count reply missing number"
echo "OK  assistant employee count"

pat_q_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/assistant/chat" \
  -H "Authorization: Bearer $staff_token" -H "Content-Type: application/json" \
  -d '{"message":"find patient named Ahmed","locale":"en"}')"
pat_q_http="$(echo "$pat_q_raw" | tail -1)"
pat_q_body="$(echo "$pat_q_raw" | sed '$d')"
[[ "$pat_q_http" == "200" || "$pat_q_http" == "201" ]] || fail "assistant patient lookup HTTP $pat_q_http"
echo "$pat_q_body" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('reply'), 'missing reply'; acts=d.get('actions') or []; assert all(a.get('type')=='open_patient' and a.get('patientId') for a in acts) if acts else True" || fail "assistant patient lookup invalid actions"
echo "OK  assistant patient lookup"

phy_login_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${PHYSICIAN_SMOKE_EMAIL:-dr.ahmed@drahmedshall.com}\",\"password\":\"$ADMIN_PASSWORD\"}")"
phy_login_http="$(echo "$phy_login_raw" | tail -1)"
phy_login_body="$(echo "$phy_login_raw" | sed '$d')"
[[ "$phy_login_http" == "200" || "$phy_login_http" == "201" ]] || fail "physician login HTTP $phy_login_http"
phy_token="$(echo "$phy_login_body" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")"
phy_rev_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/assistant/chat" \
  -H "Authorization: Bearer $phy_token" -H "Content-Type: application/json" \
  -d '{"message":"What is my gross and net income this month?","locale":"en"}')"
phy_rev_http="$(echo "$phy_rev_raw" | tail -1)"
phy_rev_body="$(echo "$phy_rev_raw" | sed '$d')"
[[ "$phy_rev_http" == "200" || "$phy_rev_http" == "201" ]] || fail "physician assistant revenue HTTP $phy_rev_http"
echo "$phy_rev_body" | python3 -c "import json,sys; r=json.load(sys.stdin).get('reply',''); assert 'gross' in r.lower() or 'net' in r.lower() or 'clinical income' in r.lower() or 'no posted' in r.lower(), r[:280]" || fail "physician income reply unexpected"
echo "OK  assistant physician income"

howto_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/assistant/chat" \
  -H "Authorization: Bearer $staff_token" -H "Content-Type: application/json" \
  -d '{"message":"How do I register a patient?","locale":"en"}')"
howto_http="$(echo "$howto_raw" | tail -1)"
howto_body="$(echo "$howto_raw" | sed '$d')"
[[ "$howto_http" == "200" || "$howto_http" == "201" ]] || fail "assistant how-to HTTP $howto_http"
echo "$howto_body" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('reply'); acts=d.get('actions') or []; assert any(a.get('type')=='navigate' and a.get('href')=='/patients' for a in acts), acts" || fail "how-to missing navigate action"
echo "OK  assistant how-to navigate"

client_name="smoke-$(date +%s)"
create_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/admin/integration-clients" \
  -H "Authorization: Bearer $staff_token" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$client_name\",\"scopes\":[\"APPOINTMENTS_READ\",\"APPOINTMENTS_WRITE\",\"OPERATIONS_READ\",\"OPERATIONS_WRITE\"]}")"
create_http="$(echo "$create_raw" | tail -1)"
create_body="$(echo "$create_raw" | sed '$d')"
[[ "$create_http" == "201" || "$create_http" == "200" ]] || fail "create integration client HTTP $create_http — $create_body"
integration_token="$(echo "$create_body" | python3 -c "import sys,json; print(json.load(sys.stdin)['bearerToken'])")"
client_id="$(echo "$create_body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")"
echo "OK  create integration client"

if [[ -n "$client_id" ]]; then
  hook_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/admin/integration-clients/$client_id/webhooks" \
    -H "Authorization: Bearer $staff_token" \
    -H "Content-Type: application/json" \
    -d '{"url":"https://httpbin.org/post","eventTypes":["APPOINTMENT_BOOKED","OPERATION_BOOKED"]}')"
  hook_http="$(echo "$hook_raw" | tail -1)"
  [[ "$hook_http" == "201" || "$hook_http" == "200" ]] || fail "register webhook HTTP $hook_http"
  echo "OK  register integration webhook"
fi

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

vf_rin_patch_http="$(curl -sS -o /dev/null -w "%{http_code}" -X PATCH "$API_BASE/clinics/$clinic_id/invoice-settings" \
  -H "Authorization: Bearer $staff_token" \
  -H "Content-Type: application/json" \
  -d '{"taxRegistrationNumber":"707597870"}')"
[[ "$vf_rin_patch_http" == "200" ]] || fail "visit-fee clinic RIN patch HTTP $vf_rin_patch_http"

visit_fee_starts="$(python3 -c "from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc)+timedelta(days=16)).replace(hour=14,minute=0,second=0,microsecond=0).isoformat().replace('+00:00','Z'))")"
vf_fee=275
vf_book_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/appointments" \
  -H "Authorization: Bearer $staff_token" \
  -H "Content-Type: application/json" \
  -d "{\"clinicId\":\"$clinic_id\",\"patientId\":\"$patient_id\",\"clinicianId\":\"$clinician_id\",\"startsAt\":\"$visit_fee_starts\",\"feeAmount\":$vf_fee,\"confirmOverlap\":true}")"
vf_book_http="$(echo "$vf_book_raw" | tail -1)"
vf_book_body="$(echo "$vf_book_raw" | sed '$d')"
[[ "$vf_book_http" == "201" || "$vf_book_http" == "200" ]] || fail "visit-fee smoke book HTTP $vf_book_http — $vf_book_body"
vf_appt_id="$(echo "$vf_book_body" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")"

vf_checkin_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/front-desk/appointments/$vf_appt_id/check-in" \
  -H "Authorization: Bearer $staff_token" \
  -H "Content-Type: application/json" \
  -d "{\"paymentAmount\":$vf_fee,\"visitCollection\":{\"mode\":\"CASH_ON_VISIT\"}}")"
vf_checkin_http="$(echo "$vf_checkin_raw" | tail -1)"
vf_checkin_body="$(echo "$vf_checkin_raw" | sed '$d')"
[[ "$vf_checkin_http" == "200" || "$vf_checkin_http" == "201" ]] || fail "visit-fee check-in HTTP $vf_checkin_http — $vf_checkin_body"
vf_enc_id="$(echo "$vf_checkin_body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('openEncounterId') or '')")"
[[ -n "$vf_enc_id" ]] || fail "visit-fee check-in missing openEncounterId"

vf_patch_raw="$(curl -sS -w "\n%{http_code}" -X PATCH "$API_BASE/encounters/$vf_enc_id" \
  -H "Authorization: Bearer $staff_token" \
  -H "Content-Type: application/json" \
  -d "{\"visitFeeAmount\":$vf_fee,\"visitCollection\":{\"mode\":\"CASH_ON_VISIT\"}}")"
vf_patch_http="$(echo "$vf_patch_raw" | tail -1)"
vf_patch_body="$(echo "$vf_patch_raw" | sed '$d')"
[[ "$vf_patch_http" == "200" ]] || fail "visit-fee encounter save HTTP $vf_patch_http — $vf_patch_body"

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
(
  cd "$repo_root/apps/api"
  node "$repo_root/scripts/assert-single-visit-fee.mjs" "$vf_appt_id"
) || fail "visit-fee ledger: expected one revenue row and one fiscal receipt"
echo "OK  check-in payment + encounter save → single visit charge and receipt"

op_date="$(python3 -c "from datetime import datetime, timedelta, timezone; print((datetime.now(timezone.utc)+timedelta(days=20)).replace(hour=9,minute=0,second=0,microsecond=0).isoformat().replace('+00:00','Z'))")"
op_ext="op-smoke-$(date +%s)"
op_book_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/integrations/operations" \
  -H "Authorization: Bearer $integration_token" \
  -H "Content-Type: application/json" \
  -d "{\"clinicId\":\"$clinic_id\",\"patientId\":\"$patient_id\",\"clinicianId\":\"$clinician_id\",\"operationDate\":\"$op_date\",\"totalCost\":1500,\"downPayment\":200,\"externalReference\":\"$op_ext\",\"noMedications\":true}")"
op_book_http="$(echo "$op_book_raw" | tail -1)"
op_book_body="$(echo "$op_book_raw" | sed '$d')"
[[ "$op_book_http" == "201" || "$op_book_http" == "200" ]] || fail "integration operation book HTTP $op_book_http — $op_book_body"
op_id="$(echo "$op_book_body" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")"
echo "OK  integration book operation $op_id"

op_cancel_http="$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$API_BASE/integrations/operations/$op_id/cancel" \
  -H "Authorization: Bearer $integration_token")"
[[ "$op_cancel_http" == "200" || "$op_cancel_http" == "201" ]] || fail "integration operation cancel HTTP $op_cancel_http"
echo "OK  integration cancel operation"

staff_op_raw="$(curl -sS -w "\n%{http_code}" -X POST "$API_BASE/operations" \
  -H "Authorization: Bearer $staff_token" \
  -H "Content-Type: application/json" \
  -d "{\"clinicId\":\"$clinic_id\",\"patientId\":\"$patient_id\",\"clinicianId\":\"$clinician_id\",\"operationDate\":\"$op_date\",\"totalCost\":500,\"noMedications\":true}")"
staff_op_http="$(echo "$staff_op_raw" | tail -1)"
[[ "$staff_op_http" == "201" || "$staff_op_http" == "200" ]] || fail "staff POST /operations HTTP $staff_op_http"
echo "OK  staff internal operation book"

echo "integration-api-smoke: all checks passed"
