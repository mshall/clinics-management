import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AssistantChatDto {
  @ApiProperty({ description: "User message to the assistant" })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({ enum: ["en", "ar"], default: "en" })
  @IsOptional()
  @IsIn(["en", "ar"])
  locale?: "en" | "ar";
}

export class AssistantChatResponseDto {
  @ApiProperty()
  reply!: string;

  @ApiProperty({ enum: ["organization_admin", "physician"] })
  persona!: "organization_admin" | "physician";

  @ApiProperty({ type: [String] })
  suggestedPrompts!: string[];
}

export class AssistantContextDto {
  @ApiProperty({ enum: ["organization_admin", "physician"] })
  persona!: "organization_admin" | "physician";

  @ApiProperty()
  title!: string;

  @ApiProperty()
  greeting!: string;

  @ApiProperty({ type: [String] })
  suggestedPrompts!: string[];

  @ApiProperty({ type: [String], description: "Nav areas the user may access" })
  allowedNavKeys!: string[];
}
