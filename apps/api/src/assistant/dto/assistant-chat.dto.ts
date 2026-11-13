import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ASSISTANT_ROLE_SLUGS } from "../assistant-access";

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

export class AssistantChatActionDto {
  @ApiProperty({ enum: ["open_patient", "navigate"] })
  type!: "open_patient" | "navigate";

  @ApiProperty({ description: "Button label (localized)" })
  label!: string;

  @ApiPropertyOptional({ description: "Patient id when type is open_patient" })
  patientId?: string;

  @ApiPropertyOptional()
  mrn?: string;

  @ApiPropertyOptional({ description: "In-app route when type is navigate (e.g. /patients)" })
  href?: string;

  @ApiPropertyOptional({ description: "Nav tab key for navigate actions" })
  navKey?: string;
}

export class AssistantChatResponseDto {
  @ApiProperty()
  reply!: string;

  @ApiProperty({ enum: ASSISTANT_ROLE_SLUGS })
  persona!: (typeof ASSISTANT_ROLE_SLUGS)[number];

  @ApiProperty({ type: [String] })
  suggestedPrompts!: string[];

  @ApiPropertyOptional({ type: [AssistantChatActionDto] })
  actions?: AssistantChatActionDto[];
}

export class AssistantContextDto {
  @ApiProperty({ enum: ASSISTANT_ROLE_SLUGS })
  persona!: (typeof ASSISTANT_ROLE_SLUGS)[number];

  @ApiProperty()
  title!: string;

  @ApiProperty()
  greeting!: string;

  @ApiProperty({ type: [String] })
  suggestedPrompts!: string[];

  @ApiProperty({ type: [String], description: "Nav areas the user may access" })
  allowedNavKeys!: string[];
}
