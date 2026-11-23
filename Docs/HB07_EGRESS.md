# HB07: outbound internet path for the API (OpenTofu, cost-safe default)

**Status 20 Nov 2026:** implemented as the variable `egress_mode` (default `none`). Validated offline only (`tofu fmt`, `validate`, `tofu test`); nothing applied.

## Problem
App Runner with `egressType: VPC` sends ALL outbound traffic of the API through the VPC connector. The connector ENIs have no public IPs, so the
public subnets' internet gateway does not help: without a NAT, the API reaches only what the VPC reaches privately (RDS, the S3 gateway endpoint
and the Secrets Manager / KMS / STS interface endpoints). Third-party calls (WhatsApp Cloud API, Paymob / Fawry / InstaPay, OpenAI EU, a video
provider) and public AWS endpoints without a VPC endpoint (SES API, CloudWatch Logs API) would time out.

## Options
| `egress_mode` | What it adds | Approx. cost (eu-central-1) | Reaches | Use when |
|---|---|---|---|---|
| `none` (default) | nothing, connector stays in the public subnets exactly as before | USD 0 | AWS APIs that have a VPC endpoint (Secrets Manager, KMS, STS, S3) | every provider adapter is in `MODE=mock` (today, CLAUDE.md founder decision) |
| `none` + `extra_interface_endpoints = ["email"]` (or `logs`, ...) | extra AWS interface endpoints | about USD 7.3 / month **per endpoint per AZ** | more AWS APIs privately | only AWS services are missing (e.g. SES API) |
| `nat_single` | 1 NAT gateway + 1 EIP + private `app` subnets for the connector | about USD 32 / month + USD 0.045 / GB | the whole internet, from one fixed IP | staging while testing real providers; prod before HA matters |
| `nat_per_az` | 1 NAT per AZ (2) + EIPs | about USD 65 / month + data | the whole internet from two fixed IPs, no cross-AZ dependency | prod once real providers are live |
| egress proxy (not implemented) | a small proxy service (Squid / Envoy) in the isolated subnets with an allow-list of hostnames | NAT cost + a task | allow-listed hosts only | if security wants hostname allow-listing; cheaper than a firewall, needs its own module |

VPC endpoints can never reach third-party APIs (WhatsApp, Paymob, OpenAI): those need `nat_*` or a proxy.

## Switching
In the live stack's `terraform.tfvars`: `egress_mode = "nat_single"` (staging) or `"nat_per_az"` (prod). The module then creates `app` subnets, EIP(s), NAT
gateway(s) and routes, and the App Runner VPC connector moves to the `app` subnets (`module.network.connector_subnet_ids`). **Changing the connector
subnets replaces the VPC connector** (App Runner updates the service in place, expect a short rollout), so do it in a quiet window and staging first.
`nat_public_ips` is an output: give those IPs to providers that require an allow-list (PSPs commonly do).

## Cost-safe decision
Default stays `none` because every provider is a mock until the "Provider go-live" pass (`Docs/KIORLY_NEEDS_HUMAN.md`). That pass must set `egress_mode` per
environment and verify each integration from staging (this is the HB07 acceptance test). Founder decision to take then: `nat_single` vs `nat_per_az` for prod,
and whether to accept a fixed egress IP.

## Related: HOME_VISIT_ADDRESS_ENCRYPTION_KEY (HVPRV01)
`enable_home_visit_address_key = true` (default in both clinic live stacks) generates 32 random bytes as hex into Secrets Manager
(`<product>-<env>/home-visit-address-key`, JSON field `key`, KMS-encrypted when `use_cmk`) and injects it as the runtime secret
`HOME_VISIT_ADDRESS_ENCRYPTION_KEY`. `apps/api/src/home-visits/address-crypto.ts` requires it in production (64 hex chars => hex). **Never taint, replace or
destroy it once home visits exist**: ciphertext is bound to this key, and a key rotation needs a re-encryption job that is not built (follow-up). Prod secrets have a 30-day deletion recovery window.

## Related: telehealth TURN (ADR-039)
With `egress_mode = none` the API cannot reach `https://rtc.live.cloudflare.com` (Cloudflare TURN credential minting); joins then fall back to STUN-only (`turn: "degraded"`), which still connects most calls directly. To issue relay credentials allow outbound HTTPS to `rtc.live.cloudflare.com` (a NAT mode, or the proxy allow-list). Browsers reach `turn.cloudflare.com` and `stun.cloudflare.com` themselves, never through our egress.
