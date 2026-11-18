import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IntegrationBookAppointmentDto } from "../integrations/dto/integration-book-appointment.dto";
import { MarketplaceApiService } from "./marketplace-api.service";
import { MarketplaceProviderProfileService } from "./marketplace-provider-profile.service";
import { MarketplaceAuthGuard } from "./marketplace-auth.guard";
import { MarketplaceClient } from "./marketplace-client.decorator";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import { SlotHoldService } from "./slot-hold.service";
import { MarketplaceBookingService, type MarketplaceBookingBody } from "./marketplace-booking.service";

@ApiTags("marketplace")
@Controller("marketplace/v1")
@UseGuards(MarketplaceAuthGuard)
@ApiHeader({ name: "X-Kiorly-Client-Key", required: true })
@ApiHeader({ name: "X-Kiorly-Client-Secret", required: true })
@ApiHeader({ name: "X-Kiorly-Timestamp", required: true })
@ApiHeader({ name: "X-Kiorly-Nonce", required: true })
@ApiHeader({ name: "X-Kiorly-Signature", required: true })
export class MarketplaceController {
  constructor(
    private readonly api: MarketplaceApiService,
    private readonly profiles: MarketplaceProviderProfileService,
    private readonly holds: SlotHoldService,
    private readonly bookings: MarketplaceBookingService,
  ) {}

  @Get("auth/verify")
  @ApiOperation({ summary: "Verify marketplace client credentials" })
  verify(@MarketplaceClient() client: PlatformIntegrationPrincipal) {
    return this.api.verify(client);
  }

  @Get("clinics")
  @ApiOperation({ summary: "List clinics with LIVE marketplace listings" })
  listClinics() {
    return this.api.listClinics();
  }

  @Get("providers")
  @ApiOperation({ summary: "Paged provider profiles for Kiorex resync (KX-02)" })
  listProviders(
    @Query("updatedSince") updatedSince?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.profiles.listProvidersForKiorex({
      updatedSince,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get("physicians")
  @ApiOperation({ summary: "List physicians with marketplace listing at clinic" })
  listPhysicians(@MarketplaceClient() client: PlatformIntegrationPrincipal, @Query("clinicId") clinicId: string) {
    return this.api.listPhysicians(client, clinicId);
  }

  @Get("clinics/:clinicId/slots")
  @ApiOperation({ summary: "Bookable slots for marketplace (KX-03)" })
  listSlots(
    @MarketplaceClient() client: PlatformIntegrationPrincipal,
    @Param("clinicId") clinicId: string,
    @Query("clinicianId") clinicianId: string,
    @Query("typeId") typeId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.api.listSlots(client, clinicId, clinicianId, typeId, from, to);
  }

  @Get("appointments/availability")
  @ApiOperation({ summary: "Bookable slots (alias; requires typeId)" })
  availability(
    @MarketplaceClient() client: PlatformIntegrationPrincipal,
    @Query("clinicId") clinicId: string,
    @Query("clinicianId") clinicianId: string,
    @Query("typeId") typeId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.api.availability(client, clinicId, clinicianId, typeId, from, to);
  }

  @Post("holds")
  @ApiOperation({ summary: "Reserve a slot for 5 minutes (KX-04)" })
  @ApiHeader({ name: "X-Kiorly-Client-Key", required: true })
  createHold(@MarketplaceClient() client: PlatformIntegrationPrincipal, @Body() body: Record<string, unknown>) {
    return this.holds.createHold(client, body as never);
  }

  @Delete("holds/:id")
  @ApiOperation({ summary: "Release a slot hold" })
  releaseHold(@MarketplaceClient() client: PlatformIntegrationPrincipal, @Param("id") id: string) {
    return this.holds.releaseHold(client, id);
  }

  @Post("bookings")
  @ApiOperation({ summary: "Confirm Kiorex booking with idempotency (KX-04)" })
  @ApiHeader({ name: "Idempotency-Key", required: true })
  createBooking(
    @MarketplaceClient() client: PlatformIntegrationPrincipal,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() body: MarketplaceBookingBody,
  ) {
    return this.bookings.createBooking(client, idempotencyKey ?? "", body);
  }

  @Get("bookings/:externalRef")
  @ApiOperation({ summary: "Get booking by Kiorex idempotency / external reference" })
  getBooking(@MarketplaceClient() client: PlatformIntegrationPrincipal, @Param("externalRef") externalRef: string) {
    return this.bookings.getByExternalRef(client, externalRef);
  }

  @Post("bookings/:externalRef/cancel")
  @HttpCode(200)
  @ApiOperation({ summary: "Patient cancels a Kiorex booking, enforced against the clinic policy (KX-06)" })
  cancelBooking(
    @MarketplaceClient() client: PlatformIntegrationPrincipal,
    @Param("externalRef") externalRef: string,
    @Body() body: { reason?: string },
  ) {
    return this.bookings.cancelByPatient(client, externalRef, body ?? {});
  }

  @Post("bookings/:externalRef/reschedule")
  @HttpCode(200)
  @ApiOperation({ summary: "Patient reschedules a Kiorex booking, enforced against the clinic policy (KX-06)" })
  rescheduleBooking(
    @MarketplaceClient() client: PlatformIntegrationPrincipal,
    @Param("externalRef") externalRef: string,
    @Body() body: { startsAt: string; endsAt?: string; holdId?: string },
  ) {
    return this.bookings.rescheduleByPatient(client, externalRef, body);
  }

  @Post("appointments")
  @ApiOperation({ summary: "Book appointment via Kiorex marketplace" })
  book(
    @MarketplaceClient() client: PlatformIntegrationPrincipal,
    @Query("clinicId") clinicId: string,
    @Body() body: IntegrationBookAppointmentDto,
  ) {
    return this.api.book(client, clinicId, { ...body, clinicId });
  }

  @Get("appointments/:id")
  @ApiOperation({ summary: "Get marketplace-booked appointment" })
  getOne(
    @MarketplaceClient() client: PlatformIntegrationPrincipal,
    @Query("clinicId") clinicId: string,
    @Param("id") id: string,
  ) {
    return this.api.getAppointment(client, clinicId, id);
  }

  @Post("appointments/:id/cancel")
  @ApiOperation({ summary: "Cancel marketplace-booked appointment" })
  cancel(
    @MarketplaceClient() client: PlatformIntegrationPrincipal,
    @Query("clinicId") clinicId: string,
    @Param("id") id: string,
  ) {
    return this.api.cancelAppointment(client, clinicId, id);
  }
}