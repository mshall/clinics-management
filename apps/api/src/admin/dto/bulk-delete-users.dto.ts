import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

export class BulkDeleteUsersDto {
  @ApiPropertyOptional({ type: [String], description: "User ids to delete" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  ids?: string[];

  @ApiPropertyOptional({ description: "When true, delete all users matching search (ignores ids)" })
  @Transform(({ value }) => value === true || value === "true")
  @IsOptional()
  @IsBoolean()
  all?: boolean;

  @ApiPropertyOptional({ description: "Same search filter as user list when all=true" })
  @IsOptional()
  @IsString()
  search?: string;
}
