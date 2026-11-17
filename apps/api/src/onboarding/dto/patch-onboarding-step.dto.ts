import { ApiProperty } from "@nestjs/swagger";

export class PatchOnboardingStepDto {
  @ApiProperty({ enum: ["complete", "skip"] })
  action!: "complete" | "skip";
}