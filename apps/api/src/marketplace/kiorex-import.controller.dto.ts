import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `rollback` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class KiorexImportRollbackBodyDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  orgId?: string;
}
