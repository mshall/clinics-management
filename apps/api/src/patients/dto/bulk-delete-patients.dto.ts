import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

export class BulkDeletePatientsDto {
  @ApiPropertyOptional({ type: [String], description: "Patient ids to soft-delete" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  ids?: string[];

  @ApiPropertyOptional({ description: "When true, delete all active patients matching search (ignores ids)" })
  @Transform(({ value }) => value === true || value === "true")
  @IsOptional()
  @IsBoolean()
  all?: boolean;

  @ApiPropertyOptional({ description: "Same search filter as patient list when all=true" })
  @IsOptional()
  @IsString()
  search?: string;
}
