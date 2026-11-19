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

  it("booking channel enum stays MARKETPLACE | CLINIC_LINK", () => {
    const spec = loadSpec();
    const consumer = loadConsumer();
    const booking = spec.paths["/bookings"]?.post;
    const channelEnum =
      booking?.requestBody?.content?.["application/json"]?.schema?.properties?.channel?.enum ?? [];
    assert.deepEqual(
      [...channelEnum].sort(),
      [...consumer.bookingChannelEnum].sort(),
      "breaking: booking.channel enum changed",
    );
  });

  it("consumer contract fixture is published for the Kiorex repo", () => {
    const consumer = loadConsumer();
    assert.equal(consumer.basePath, "/marketplace/v1");
    assert.ok(consumer.requiredOperations.length >= 18);
    assert.ok(consumer.authHeaders.includes("X-Kiorly-Signature"));
  });
});
