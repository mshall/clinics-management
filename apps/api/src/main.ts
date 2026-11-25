import "reflect-metadata";
import { bootstrapTelemetry } from "./observability/telemetry.bootstrap";
import { applyStagingEnvDefaults } from "./staging/staging-profile";
import { RequestMethod } from "@nestjs/common";
import { AppValidationPipe } from "./common/lenient-dto";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { LoginDto } from "./auth/dto/login.dto";
import { AuthUserDto, LoginResponseDto } from "./common/dto/auth-responses.dto";
import { ClinicDto } from "./common/dto/clinic.dto";
import { GroupOverviewKpisDto } from "./common/dto/dashboard.dto";
import { PatientDto } from "./common/dto/patient.dto";
import { orderedGlobalFilters } from "./common/global-filters";
import { RejectNulBytesPipe } from "./common/reject-nul-bytes.pipe";
import { IntegrationFailureExceptionFilter } from "./integrations/integration-failure.filter";
import { webBuildIdMiddleware } from "./common/web-build-id.middleware";
import compressionMiddleware from "compression";
import { json, type NextFunction, type Request, type Response } from "express";
import { assertProviderEnv } from "./common/provider-env";
import { warnIfLeadSigningMissing } from "./common/lead-signing-status";
import { applyHttpHardening, assertProductionSecrets, swaggerEnabled } from "./common/http-hardening";

async function bootstrap() {
  bootstrapTelemetry();
  applyStagingEnvDefaults();
  assertProductionSecrets(); // fail fast: production never signs sessions with a weak or published key (names only)
  assertProviderEnv(); // fail fast: MODE=real but URL/credentials missing
  warnIfLeadSigningMissing(); // production without KIOREX_LEAD_SIGNING_SECRET: a notice only (names, never values)
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  // Amazon SNS (SES bounce / complaint events) posts Content-Type text/plain; the controller needs the body as text
  (app as unknown as { useBodyParser?: (t: string, o: object) => void }).useBodyParser?.("text", { type: "text/plain", limit: "1mb" });
  applyHttpHardening(app); // security headers, no X-Powered-By, trust-proxy hops (TRUSTED_PROXY_HOPS)
  // Org-onboarding import chunks carry base64 documents: a larger JSON limit on that HMAC path only (the signature is verified over the raw bytes).
  // The parser is wrapped on purpose: Nest decides whether to install its own global JSON parser by looking for a router layer named
  // "jsonParser"; mounting body-parser's json() directly (even path-scoped) made Nest skip it, so EVERY other JSON body arrived empty.
  const importsJson = json({ limit: "48mb", verify: (req, _res, buf) => { (req as { rawBody?: Buffer }).rawBody = buf; } });
  app.use("/marketplace/v1/imports", (req: Request, res: Response, next: NextFunction) => importsJson(req, res, next));
  app.use(
    compressionMiddleware({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false;
        // Large org-backup ZIP/SQL streams set Content-Length; gzip would desync and Chrome reports "Failed - Network error".
        const path = req.url ?? "";
        if (path.includes("/admin/org-backup/download") || /\/export\/jobs\/[^/]+\/download/.test(path)) {
          return false;
        }
        return compressionMiddleware.filter(req, res);
      },
    }),
  );
  app.useGlobalFilters(...orderedGlobalFilters(app.get(IntegrationFailureExceptionFilter)));
  app.enableCors({
    origin: true, // bearer-token API: no cookies and no ambient credentials, so a reflected Origin cannot ride a victim session
    credentials: false,
    exposedHeaders: [
      "X-Kiorly-Web-Build-Id",
      "X-Kiorly-Web-Build-Built-At",
      "X-Kiorly-Web-Min-Built-At",
      // Org-backup fetch downloads (cross-origin from Vite → API) need these for progress / filename.
      "Content-Length",
      "Content-Disposition",
    ],
  });
  app.use(webBuildIdMiddleware);
  app.setGlobalPrefix("api/v1", {
    exclude: [{ path: "marketplace/v1/(.*)", method: RequestMethod.ALL }],
  });
  app.useGlobalPipes(
    new RejectNulBytesPipe(),
    new AppValidationPipe()
  );

  if (swaggerEnabled()) { // off in production unless SWAGGER_ENABLED=true
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Kiorly API")
      .setDescription("REST API for the clinic platform (v1).")
      .setVersion("1.0.0")
      .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "bearer")
      .addBearerAuth(
        {
          type: "http",
          scheme: "bearer",
          bearerFormat: "kio_live.ic_….secret",
          description: "Integration client token from Admin → Integration API clients",
        },
        "integration",
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig, {
      extraModels: [LoginDto, LoginResponseDto, AuthUserDto, PatientDto, ClinicDto, GroupOverviewKpisDto],
    });
    SwaggerModule.setup("docs", app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.LISTEN_HOST ?? "0.0.0.0";
  await app.listen(port, host);
  // Large org-backup ZIP downloads can exceed default Node HTTP timeouts mid-stream
  // (Chrome then shows "Failed - Network error").
  const httpServer = app.getHttpServer() as {
    requestTimeout?: number;
    headersTimeout?: number;
    keepAliveTimeout?: number;
    timeout?: number;
  };
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 0;
  httpServer.keepAliveTimeout = 120_000;
  httpServer.timeout = 0;
  console.log(`API listening on http://localhost:${port}/api/v1`);
  if (swaggerEnabled()) {
    console.log(`OpenAPI UI: http://localhost:${port}/docs`);
    console.log(`OpenAPI JSON: http://localhost:${port}/docs-json`);
  }
}

void bootstrap();
