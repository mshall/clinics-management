import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class HandoffLoginDto {
  @ApiProperty({ example: "owner.na@demo.kiorex.test" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Demo@12345" })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;

  @ApiPropertyOptional({ enum: ["NURSE"], description: "The Kiorly Nurse tile (an edition of Clinic): the code is bound to it" })
  @IsOptional()
  @IsIn(["NURSE"])
  edition?: "NURSE";
}

export class HandoffExchangeDto {
  @ApiProperty({ description: "Single-use code from POST /auth/handoff/login" })
  @IsString()
  @MaxLength(128)
  code!: string;

  @ApiPropertyOptional({ enum: ["NURSE"] })
  @IsOptional()
  @IsIn(["NURSE"])
  edition?: "NURSE";
}
