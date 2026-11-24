import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `decide` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class KiorexConnectionDecideBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  decision!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  connectionId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  reasonCode?: string;
}
