import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsIn, IsOptional, IsString } from "class-validator";
import { Lenient } from "../../common/lenient-dto";
import type { OrgBackupFormat } from "./org-backup.service";

/** Body of `startExportJob` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class AdminDataExplorerStartExportJobBodyDto {
  @ApiProperty({ enum: ["SQL", "DOCUMENTS", "FULL"] })
  @IsIn(["SQL", "DOCUMENTS", "FULL"])
  format!: OrgBackupFormat;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tables?: string[];
}
