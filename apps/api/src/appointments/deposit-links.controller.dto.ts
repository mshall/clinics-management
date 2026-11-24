import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional } from "class-validator";
import { Lenient } from "../common/lenient-dto";
import type { DepositPolicy } from "../markets/commercial-config.schema";

/** Body of `updatePolicy` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class DepositLinksUpdatePolicyBodyDto {
  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  policy!: Partial<DepositPolicy> | null;
}
