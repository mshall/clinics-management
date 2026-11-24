import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsIn, IsObject, IsOptional, IsString } from "class-validator";
import { Lenient } from "../common/lenient-dto";

/** Body of `complete` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class NurseEditionCompleteBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  signupToken!: string;

  @ApiProperty({ enum: ["SOLO", "AGENCY"] })
  @IsIn(["SOLO", "AGENCY"])
  kind!: "SOLO" | "AGENCY";

  @ApiProperty({ type: Object })
  @IsObject()
  profile!: { displayName: string; email: string; password: string };

  @ApiProperty({ type: Object })
  @IsObject()
  practice!: { nameEn: string; nameAr?: string; city: string };

  @ApiProperty({ type: String })
  @IsString()
  planKey!: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  legalAcceptances?: { document: string; version: string }[];
}

/** Body of `changeEdition` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class NurseEditionChangeEditionBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  edition!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  kind?: string | null;
}
