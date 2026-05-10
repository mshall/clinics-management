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
import { PrismaClientExceptionFilter } from "./common/prisma-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new PrismaClientExceptionFilter());
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
