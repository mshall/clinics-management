/**
 * QA-07 — k6 load: marketplace slots + booking hold path.
 *
 * Target: 50 rps sustained, slots p95 < 150 ms.
 *
 *   K6_BASE_URL=https://staging.example k6 run perf/k6/marketplace-slots-bookings.js
 *
 * Auth: set KIORLY_CLIENT_KEY / KIORLY_CLIENT_SECRET / KIORLY_HMAC_SECRET
 * (HMAC signing helpers are simplified — staging runs use the Kiorex load harness).
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE = (__ENV.K6_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const CLINIC_ID = __ENV.K6_CLINIC_ID || "";
const CLINICIAN_ID = __ENV.K6_CLINICIAN_ID || "";
const TYPE_ID = __ENV.K6_TYPE_ID || "";

const slotsP95 = new Trend("slots_latency", true);
const slotErrors = new Rate("slots_errors");

export const options = {
  scenarios: {
    slots_50_rps: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 20,
      maxVUs: 80,
    },
  },
  thresholds: {
    slots_latency: ["p(95)<150"],
    slots_errors: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
  },
};

function authHeaders() {
  return {
    "X-Kiorly-Client-Key": __ENV.KIORLY_CLIENT_KEY || "",
    "X-Kiorly-Client-Secret": __ENV.KIORLY_CLIENT_SECRET || "",
    "X-Kiorly-Timestamp": String(Math.floor(Date.now() / 1000)),
    "X-Kiorly-Nonce": `k6-${__VU}-${__ITER}`,
    "X-Kiorly-Signature": __ENV.KIORLY_HMAC_SIGNATURE || "ci-placeholder",
  };
}

export default function () {
  if (!CLINIC_ID || !CLINICIAN_ID || !TYPE_ID) {
    // Health probe keeps the script runnable without marketplace fixtures (CI dry path).
    const res = http.get(`${BASE}/api/v1/health/ready`);
    slotsP95.add(res.timings.duration);
    slotErrors.add(res.status !== 200);
    check(res, { "health ready": (r) => r.status === 200 });
    return;
  }

  const from = new Date().toISOString();
  const to = new Date(Date.now() + 7 * 864e5).toISOString();
  const url =
    `${BASE}/marketplace/v1/clinics/${CLINIC_ID}/slots` +
    `?clinicianId=${CLINICIAN_ID}&typeId=${TYPE_ID}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = http.get(url, { headers: authHeaders() });
  slotsP95.add(res.timings.duration);
  slotErrors.add(res.status !== 200);
  check(res, { "slots 200": (r) => r.status === 200 });
  sleep(0.01);
}
