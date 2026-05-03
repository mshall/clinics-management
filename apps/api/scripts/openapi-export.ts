import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "../src/app.module";
import { LoginDto } from "../src/auth/dto/login.dto";
import { AuthUserDto, LoginResponseDto } from "../src/common/dto/auth-responses.dto";
import { ClinicDto } from "../src/common/dto/clinic.dto";
import { GroupOverviewKpisDto } from "../src/common/dto/dashboard.dto";
import { PatientDto } from "../src/common/dto/patient.dto";

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Clinic Management System API")
    .setDescription("REST API for the clinic platform (v1).")
    .setVersion("1.0.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "bearer")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    extraModels: [LoginDto, LoginResponseDto, AuthUserDto, PatientDto, ClinicDto, GroupOverviewKpisDto],
  });
  const dir = join(process.cwd(), "openapi");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "openapi.json");
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`Wrote ${file}`);
}

void main();
