import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AppointmentQueueStage, AppointmentStatus, BookingSource, VisitCollectionMode } from "@prisma/client";

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

  @ApiPropertyOptional({ nullable: true })
  clinicianFirstNameEn!: string | null;

  @ApiPropertyOptional({ nullable: true })
  clinicianLastNameEn!: string | null;

  @ApiPropertyOptional({ nullable: true })
  clinicianFirstNameAr!: string | null;

  @ApiPropertyOptional({ nullable: true })
  clinicianLastNameAr!: string | null;

  @ApiProperty()
  startsAt!: string;

  @ApiPropertyOptional({ nullable: true })
  endsAt!: string | null;

  @ApiProperty({ description: "Scheduled visit fee for this appointment" })
  feeAmount!: number;

  @ApiPropertyOptional({ description: "Whether scheduled fee and balances are visible for this viewer" })
  financialsVisible?: boolean;

  @ApiPropertyOptional({ enum: VisitCollectionMode, nullable: true })
  scheduledCollectionMode?: VisitCollectionMode | null;

  @ApiPropertyOptional({ nullable: true, description: "Planned transfer channel when scheduled fee uses money transfer" })
  scheduledTransferChannel?: string | null;

  @ApiProperty({ enum: AppointmentStatus })
  status!: AppointmentStatus;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Present on list responses when patient is included" })
  patientMrn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  patientName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  roomLabel?: string | null;

  @ApiPropertyOptional({ enum: AppointmentQueueStage, nullable: true })
  queueStage?: AppointmentQueueStage | null;

  @ApiPropertyOptional({ nullable: true, description: "Hint for auto room assignment when the encounter starts" })
  preferredRoomLabel?: string | null;

  @ApiPropertyOptional({ nullable: true })
  roomAssignedAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  checkedInAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  queueTicketNumber?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Open draft or amended encounter created at check-in (when status is CHECKED_IN)",
  })
  openEncounterId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Uncollected visit fee while encounter is open" })
  visitBalanceDueAmount?: number | null;

  @ApiPropertyOptional({ nullable: true })
  visitBalanceDueCurrency?: string | null;

  @ApiPropertyOptional({ nullable: true })
  visitBalanceRevenueId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Set when the patient confirmed via WhatsApp quick reply (MS-02)",
  })
  whatsappConfirmedAt?: string | null;

  @ApiProperty({ enum: BookingSource })
  bookingSource!: BookingSource;

  @ApiPropertyOptional({ nullable: true })
  attributionJson?: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true, description: "Frozen at booking time for commission attribution" })
  isNewPatientAtBooking?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  newPatientCheckedAt?: string | null;

  @ApiPropertyOptional({ description: "Whether this booking may incur Kiorex commission (CR-02)" })
  commissionChargeableAtBooking?: boolean;
}
