import { ApiProperty } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { IsArray, IsEnum } from "class-validator";

export class PatchUserRolesDto {
  @ApiProperty({
    type: [String],
    enum: UserRole,
    description: "Extra roles held alongside the user's primary role",
  })
  @IsArray()
  @IsEnum(UserRole, { each: true })
  additionalRoles!: UserRole[];
}