import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class ChangePasswordDto {
  @ApiProperty({ description: "Your current password" })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: 8, description: "New password (min 8 characters)" })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
