import { Profession } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class SetProfessionDto {
  @IsEnum(Profession)
  profession!: Profession;

  /** PRSOP03 — required when profession = ASSISTANT. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  supervisorUserId?: string;
}
