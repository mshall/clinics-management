#!/usr/bin/env bash
# Configure Egyptian Tax Authority (ETA) credentials in AWS Secrets Manager for App Runner.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRET_NAME="${ETA_SECRET_NAME:-kiorly-clinics-management/eta-credentials}"
REGION="${AWS_REGION:-eu-central-1}"
SERVICE_NAME="${APPRUNNER_SERVICE_NAME:-kiorly-clinics-management-api}"

if ! command -v aws >/dev/null 2>&1; then
  echo "AWS CLI required." >&2
  exit 1
fi

: "${ETA_API_BASE_URL:?Set ETA_API_BASE_URL}"
: "${ETA_CLIENT_ID:?Set ETA_CLIENT_ID}"
: "${ETA_CLIENT_SECRET:?Set ETA_CLIENT_SECRET}"

SIGNING_KEY="${ETA_SIGNING_KEY:-$ETA_CLIENT_SECRET}"
WHATSAPP_URL="${WHATSAPP_API_URL:-}"
WHATSAPP_TOKEN="${WHATSAPP_API_TOKEN:-}"

SECRET_JSON=$(cat <<EOF
{
  "etaApiBaseUrl": "$ETA_API_BASE_URL",
  "etaClientId": "$ETA_CLIENT_ID",
  "etaClientSecret": "$ETA_CLIENT_SECRET",
  "etaSigningKey": "$SIGNING_KEY",
  "whatsappApiUrl": "$WHATSAPP_URL",
  "whatsappApiToken": "$WHATSAPP_TOKEN"
}
EOF
)

if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws secretsmanager put-secret-value --secret-id "$SECRET_NAME" --region "$REGION" --secret-string "$SECRET_JSON"
else
  aws secretsmanager create-secret --name "$SECRET_NAME" --region "$REGION" --secret-string "$SECRET_JSON"
fi

echo "Updated secret $SECRET_NAME"
echo "Map fields to App Runner env: ETA_API_BASE_URL, ETA_CLIENT_ID, ETA_CLIENT_SECRET, ETA_SIGNING_KEY, WHATSAPP_API_URL, WHATSAPP_API_TOKEN"
echo "Then restart service: $SERVICE_NAME"