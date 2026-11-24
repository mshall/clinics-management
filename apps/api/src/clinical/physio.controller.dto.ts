import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Allow, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";
import type { PhysioService } from "./physio.service";

/** Body of `discharge` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PhysioPublicDischargeBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  summary!: string;
}

/** Body of `programme` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PhysioPublicProgrammeBodyDto {
  @ApiProperty({ type: Object })
  @Allow()
  exercises!: Parameters<PhysioService["setHomeProgramme"]>[2];
}
