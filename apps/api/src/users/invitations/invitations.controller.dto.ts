import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString } from "class-validator";
import { Lenient } from "../../common/lenient-dto";
import type { UserRole } from "@prisma/client";

/** Body of `create` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PublicInvitationsCreateBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  phoneOrEmail!: string;

  @ApiProperty({ type: [Object] })
  @IsArray()
  roles!: UserRole[];

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clinicIds?: string[];
}

/** Body of `accept` (was an inline type, which class-validator cannot check). Unknown fields are ignored, as before. */
@Lenient()
export class PublicInvitationsAcceptBodyDto {
  @ApiProperty({ type: String })
  @IsString()
  password!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  displayName?: string;
}
