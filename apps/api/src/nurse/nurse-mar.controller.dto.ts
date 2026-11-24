import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";
import type { OrderLine } from "./mar-safety";

/** Body of `photoOrder` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class NurseMarPhotoOrderBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  patientId!: string;

  @ApiProperty({ type: String })
  @IsString()
  prescriberName!: string;

  @ApiProperty({ type: String })
  @IsString()
  orderedOn!: string;

  @ApiProperty({ type: String })
  @IsString()
  expiresOn!: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  controlled?: boolean;

  @ApiProperty({ type: [Object] })
  @IsArray()
  lines!: OrderLine[];

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  documentKey?: string;
}
