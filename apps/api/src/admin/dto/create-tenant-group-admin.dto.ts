import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class CreateTenantGroupAdminDto {
  @ApiProperty({ description: "Sign-in email (username) for the organization group administrator" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: "Acme Group Administrator" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName!: string;
}
