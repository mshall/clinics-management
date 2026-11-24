import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const API_ROOT = join(__dirname, "../..");
const SPEC_PATH = join(API_ROOT, "openapi", "marketplace.openapi.json");
const CONSUMER_PATH = join(API_ROOT, "openapi", "kiorex-consumer-contract.json");
const CONTROLLER_PATH = join(__dirname, "marketplace.controller.ts");

type OpenApiOp = {
  operationId?: string;
  parameters?: Array<{ name: string; in: string; required?: boolean }>;
  requestBody?: {
    content?: {
      "application/json"?: {
        schema?: {
          properties?: Record<string, { enum?: string[] }>;
        };
      };
    };
  };
};

type OpenApiSpec = {
  openapi: string;
  info: { title: string; version: string };
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, OpenApiOp>>;
};

type ConsumerContract = {
  basePath: string;
  authHeaders: string[];
  requiredOperations: Array<{ method: string; path: string; operationId: string }>;
  slotQueryRequired: string[];
  bookingChannelEnum: string[];
};

function loadSpec(): OpenApiSpec {
  return JSON.parse(readFileSync(SPEC_PATH, "utf8")) as OpenApiSpec;
}

function loadConsumer(): ConsumerContract {
  return JSON.parse(readFileSync(CONSUMER_PATH, "utf8")) as ConsumerContract;
}

function collectOperationIds(spec: OpenApiSpec): string[] {
  const ids: string[] = [];
  for (const pathItem of Object.values(spec.paths)) {
    for (const op of Object.values(pathItem)) {
      if (op?.operationId) ids.push(op.operationId);
    }
  }
  return ids;
}

/** Nest path params use `:id`; OpenAPI uses `{id}`. */
function nestPathToOpenApi(nestPath: string): string {
  return nestPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function parseControllerRoutes(src: string): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];
  const re = /@(Get|Post|Put|Patch|Delete)\("([^"]*)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    routes.push({ method: m[1].toLowerCase(), path: `/${m[2]}`.replace(/\/+/g, "/") });
  }
  return routes;
}

describe("QA-04 marketplace OpenAPI contract", () => {
  it("spec defines every KX marketplace operationId", () => {
    const spec = loadSpec();
    const consumer = loadConsumer();
    const operationIds = collectOperationIds(spec);
    for (const req of consumer.requiredOperations) {
      assert.ok(
        operationIds.includes(req.operationId),
        `missing operationId ${req.operationId} in marketplace.openapi.json`,
      );
    }
    assert.equal(spec.info.title, "Kiorex Marketplace API");
    assert.ok(spec.openapi.startsWith("3."));
    assert.equal(spec.servers[0]?.url, consumer.basePath);
  });

  it("breaking changes to required paths/methods/operationIds fail CI", () => {
    const spec = loadSpec();
    const consumer = loadConsumer();
    for (const req of consumer.requiredOperations) {
      const pathItem = spec.paths[req.path];
      assert.ok(pathItem, `breaking: path ${req.path} removed from OpenAPI`);
      const op = pathItem[req.method];
      assert.ok(op, `breaking: ${req.method.toUpperCase()} ${req.path} removed from OpenAPI`);
      assert.equal(
        op.operationId,
        req.operationId,
        `breaking: operationId for ${req.method.toUpperCase()} ${req.path} changed (was ${req.operationId}, now ${op.operationId})`,
      );
    }
  });

  it("Nest marketplace controller routes stay aligned with OpenAPI", () => {
    const spec = loadSpec();
    const src = readFileSync(CONTROLLER_PATH, "utf8");
    const routes = parseControllerRoutes(src);
    assert.ok(routes.length >= 15, "expected marketplace controller to expose marketplace routes");
    for (const route of routes) {
      const openApiPath = nestPathToOpenApi(route.path);
      const pathItem = spec.paths[openApiPath];
      assert.ok(pathItem, `controller route ${route.method.toUpperCase()} ${route.path} missing from OpenAPI as ${openApiPath}`);
      assert.ok(
        pathItem[route.method],
        `controller ${route.method.toUpperCase()} ${route.path} has no OpenAPI operation`,
      );
    }
  });

  it("controller still requires Kiorex HMAC auth headers", () => {
    const consumer = loadConsumer();
    const src = readFileSync(CONTROLLER_PATH, "utf8");
    assert.match(src, /MarketplaceAuthGuard/);
    for (const header of consumer.authHeaders) {
      assert.ok(src.includes(header), `missing auth header ${header} on marketplace controller`);
    }
  });

  it("slot query contract keeps required parameters", () => {
    const spec = loadSpec();
    const consumer = loadConsumer();
    const slots = spec.paths["/clinics/{clinicId}/slots"]?.get;
    assert.ok(slots);
    const queryNames = (slots.parameters ?? []).filter((p) => p.in === "query" && p.required).map((p) => p.name);
    for (const name of consumer.slotQueryRequired) {
      assert.ok(queryNames.includes(name), `breaking: slots query lost required param ${name}`);
    }
  });

  it("booking channel enum keeps MARKETPLACE | CLINIC_LINK (1.6.0 appends KIOREX_WHATSAPP)", () => {
    const spec = loadSpec();
    const consumer = loadConsumer();
    const booking = spec.paths["/bookings"]?.post;
    const channelEnum =
      booking?.requestBody?.content?.["application/json"]?.schema?.properties?.channel?.enum ?? [];
    // contracts 1.12.0 (marketplace 1.6.0) only APPENDS KIOREX_WHATSAPP; the consumer fixture lists what Kiorex sends today, so it may be a subset.
    const added = (channelEnum as string[]).filter((c) => !(consumer.bookingChannelEnum as string[]).includes(c));
    assert.deepEqual(added.filter((c) => c !== "KIOREX_WHATSAPP"), [], "breaking: booking.channel enum changed");
    for (const c of consumer.bookingChannelEnum as string[]) assert.ok(channelEnum.includes(c), `breaking: booking.channel lost ${c}`);
  });

  it("consumer contract fixture is published for the Kiorex repo", () => {
    const consumer = loadConsumer();
    assert.equal(consumer.basePath, "/marketplace/v1");
    assert.ok(consumer.requiredOperations.length >= 18);
    assert.ok(consumer.authHeaders.includes("X-Kiorly-Signature"));
  });

  it("GRW-P1-D2 contracts 1.4.0: the copy documents the optional signed acquisition block, its error codes and keeps the old fields", () => {
    const spec = loadSpec() as OpenApiSpec & { components: { schemas: Record<string, { required?: string[]; properties?: Record<string, { enum?: string[] }> }> } };
    assert.match(spec.info.version, /^1\.(4|5|6)\.\d+$/, "1.4.0 added the acquisition block; 1.5.0 (contracts 1.11.0) and 1.6.0 (contracts 1.12.0) only add");
    const body = spec.paths["/bookings"]?.post?.requestBody?.content?.["application/json"]?.schema?.properties as Record<string, unknown>;
    for (const f of ["channel", "bookingPageSlug", "attribution", "acquisition"]) assert.ok(f in body, `booking request lost ${f}`);
    assert.deepEqual(body.acquisition, { $ref: "#/components/schemas/AcquisitionBlock" });
    const block = spec.components.schemas.AcquisitionBlock!;
    assert.deepEqual([...(block.required ?? [])].sort(), ["decisionId", "evidenceHash", "origin", "policyVersion", "reason"], "acquisition is optional as a whole, these fields are required inside it");
    assert.deepEqual([...block.properties!.origin!.enum!].sort(), ["MARKETPLACE", "PROVIDER_LED", "UNATTRIBUTED"]);
    assert.deepEqual([...spec.components.schemas.AcquisitionError!.properties!.code!.enum!].sort(), ["ACQUISITION_BLOCK_INVALID", "ACQUISITION_EVIDENCE_HASH_INVALID"]);
    const required = (spec.paths["/bookings"]?.post as { requestBody?: { required?: boolean } }).requestBody?.required;
    assert.notEqual(required, true, "an older Kiorex that sends no acquisition block must keep working");
  });

  it("GRW-P1-D2 the origins and error codes the service accepts are the ones the spec documents", async () => {
    const { ACQUISITION_ORIGINS, parseAcquisitionBlock } = await import("../growth/acquisition-contract");
    const spec = loadSpec() as unknown as { components: { schemas: Record<string, { properties?: Record<string, { enum?: string[] }> }> } };
    assert.deepEqual([...ACQUISITION_ORIGINS].sort(), [...spec.components.schemas.AcquisitionBlock!.properties!.origin!.enum!].sort());
    const bad = parseAcquisitionBlock({ origin: "MARKETPLACE", decisionId: "d", policyVersion: "v", reason: "MARKETPLACE_TOUCH", evidenceHash: "nope" });
    assert.ok(!bad.ok && spec.components.schemas.AcquisitionError!.properties!.code!.enum!.includes(bad.code));
  });

  it("documents the optional Clinic link token `lt` on POST /bookings (contracts 1.11.0)", () => {
    const spec = loadSpec() as unknown as { paths: Record<string, Record<string, { requestBody?: { content?: { "application/json"?: { schema?: { properties?: Record<string, { type?: string }>; required?: string[] } } } } }>> };
    const schema = spec.paths["/bookings"]?.post?.requestBody?.content?.["application/json"]?.schema;
    assert.equal(schema?.properties?.lt?.type, "string", "lt must be documented on POST /bookings");
    assert.ok(!(schema?.required ?? []).includes("lt"), "lt is optional");
  });

  it("link registry lookup routes of the referral-links controller are in OpenAPI", () => {
    const spec = loadSpec();
    const src = readFileSync(join(__dirname, "marketplace-referral-links.controller.ts"), "utf8");
    assert.match(src, /MarketplaceAuthGuard/);
    const base = /@Controller\("marketplace\/v1\/([^"]*)"\)/.exec(src)?.[1];
    assert.equal(base, "referral-links");
    for (const r of parseControllerRoutes(src)) {
      const openApiPath = nestPathToOpenApi(`/${base}${r.path === "/" ? "" : r.path}`);
      assert.ok(spec.paths[openApiPath]?.[r.method], `referral-links ${r.method.toUpperCase()} ${openApiPath} missing from OpenAPI`);
    }
    assert.equal(spec.paths["/referral-links/{code}"]?.get?.operationId, "marketplaceGetReferralLink");
    assert.equal(spec.paths["/referral-links"]?.get?.operationId, "marketplaceListReferralLinks");
  });

  it("GRW-GC-2 contracts 1.12.0 (marketplace 1.6.0): the copy documents the Clinic-side items and the Clinic implements them", () => {
    const spec = loadSpec() as unknown as {
      info: { version: string };
      paths: Record<string, Record<string, { operationId?: string }>>;
      components: { schemas: Record<string, { properties?: Record<string, { enum?: string[]; items?: { enum?: string[] } }> }> };
    };
    assert.match(spec.info.version, /^1\.6\.\d+$/, "the Clinic copy is the 1.6.0 contract");
    // G-9 KIOREX_WHATSAPP is a documented booking channel AND the service accepts and stores it
    const channel = spec.paths["/bookings"]?.post && (spec.paths["/bookings"]!.post as never as { requestBody: { content: { "application/json": { schema: { properties: { channel: { enum: string[] } } } } } } }).requestBody.content["application/json"].schema.properties.channel.enum;
    assert.ok(channel.includes("KIOREX_WHATSAPP"));
    const booking = readFileSync(join(__dirname, "marketplace-booking.service.ts"), "utf8");
    assert.match(booking, /KIOREX_WHATSAPP_CHANNEL/);
    assert.match(booking, /BookingSource\.KIOREX_WHATSAPP/);
    // G-8 waitlist join / read / leave / accept / decline are documented and routed (they were already in 1.1.0)
    const routes = parseControllerRoutes(readFileSync(CONTROLLER_PATH, "utf8"));
    for (const [m, p] of [["post", "/waitlist"], ["get", "/waitlist/{externalRef}"], ["delete", "/waitlist/{externalRef}"], ["post", "/waitlist/offers/{offerId}/accept"], ["post", "/waitlist/offers/{offerId}/decline"]] as const) {
      assert.ok(spec.paths[p]?.[m], `${m} ${p} documented`);
      assert.ok(routes.some((r) => r.method === m && nestPathToOpenApi(r.path) === p), `${m} ${p} routed`);
    }
    // G-13 slot counts for the liquidity dashboard: the documented path is analytics/slot-capacity and it is routed
    assert.ok(spec.paths["/analytics/slot-capacity"]?.get);
    assert.ok(routes.some((r) => r.method === "get" && r.path === "/analytics/slot-capacity"));
    // G-12 pay-link registration is documented in the copy (hosted by Kiorex, called by Kiorly)
    assert.ok(spec.paths["/pay/links"]?.post, "POST /pay/links documented");
    // G-10 telemedicine capability: `modalities` includes VIDEO and the profile publisher sets it
    const provider = Object.values(spec.components.schemas).find((sc) => sc.properties?.modalities);
    assert.ok(provider?.properties?.modalities?.items?.enum?.includes("VIDEO") || (provider?.properties?.modalities as { items?: { enum?: string[] } })?.items?.enum?.includes("VIDEO"));
    assert.match(readFileSync(join(__dirname, "marketplace-provider-profile.service.ts"), "utf8"), /modalities: modalitiesOf\(/);
  });

  it("GRW-P2-C the signed provider-verification routes are HMAC guarded and documented as a Clinic-side addition", () => {
    const src = readFileSync(join(__dirname, "marketplace-provider-verification.controller.ts"), "utf8");
    assert.match(src, /MarketplaceAuthGuard/);
    assert.equal(/@Controller\("marketplace\/v1\/([^"]*)"\)/.exec(src)?.[1], "provider-verification");
    const routes = parseControllerRoutes(src).map((r) => `${r.method} ${r.path}`).sort();
    assert.deepEqual(routes, ["get /requests/:requestRef", "post /decisions"]);
  });
});
