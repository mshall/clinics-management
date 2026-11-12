import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IntegrationFailureStatus } from "@prisma/client";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class PatchIntegrationFailureDto {
  @ApiProperty({ enum: ["OPEN", "ACKNOWLEDGED", "RESOLVED"] })
  @IsIn(["OPEN", "ACKNOWLEDGED", "RESOLVED"])
  status!: IntegrationFailureStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
