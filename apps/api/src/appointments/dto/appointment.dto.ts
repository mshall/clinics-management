import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AppointmentStatus } from "@prisma/client";

export class AppointmentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  clinicId!: string;

  @ApiPropertyOptional({ nullable: true, description: "Clinic display name (English)" })
  clinicNameEn!: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Clinic display name (Arabic)" })
  clinicNameAr!: string | null;

  @ApiProperty()
  patientId!: string;

  @ApiProperty()
  clinicianId!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "Clinician name: linked employee first/last (EN) when present, else user displayName",
  })
  clinicianName!: string | null;

  @ApiProperty()
  startsAt!: string;

  @ApiProperty()
  endsAt!: string;

  @ApiProperty({ enum: AppointmentStatus })
  status!: AppointmentStatus;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Present on list responses when patient is included" })
  patientMrn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  patientName?: string | null;
}
