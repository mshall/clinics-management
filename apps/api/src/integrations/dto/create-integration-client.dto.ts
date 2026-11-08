import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IntegrationScope } from "@prisma/client";
import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateIntegrationClientDto {
  @ApiProperty({ example: "Patient portal — production" })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    enum: IntegrationScope,
    isArray: true,
    default: ["APPOINTMENTS_READ", "APPOINTMENTS_WRITE"],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(IntegrationScope, { each: true })
  scopes?: IntegrationScope[];

  @ApiPropertyOptional({
    description: "Restrict bookings to these clinic ids; empty = all active clinics in the organization",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedClinicIds?: string[];
}
