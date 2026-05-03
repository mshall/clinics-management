import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "physician@demo.clinic" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "demo" })
  @IsString()
  @MinLength(1)
  password!: string;
}
