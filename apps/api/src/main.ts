import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { LoginDto } from "./auth/dto/login.dto";
import { AuthUserDto, LoginResponseDto } from "./common/dto/auth-responses.dto";
import { ClinicDto } from "./common/dto/clinic.dto";
import { GroupOverviewKpisDto } from "./common/dto/dashboard.dto";
import { PatientDto } from "./common/dto/patient.dto";
import { MulterExceptionFilter } from "./common/multer-exception.filter";
import { PrismaClientExceptionFilter } from "./common/prisma-exception.filter";
import { IntegrationFailureExceptionFilter } from "./integrations/integration-failure.filter";
import compression from "compression";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false;
        return compression.filter(req, res);
      },
    }),
  );
  app.useGlobalFilters(
    new MulterExceptionFilter(),
    new PrismaClientExceptionFilter(),
    app.get(IntegrationFailureExceptionFilter),
  );
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  if (process.env.SWAGGER_ENABLED !== "false") {
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
  console.log(`API listening on http://localhost:${port}/api/v1`);
  if (process.env.SWAGGER_ENABLED !== "false") {
    console.log(`OpenAPI UI: http://localhost:${port}/docs`);
    console.log(`OpenAPI JSON: http://localhost:${port}/docs-json`);
  }
}

void bootstrap();
