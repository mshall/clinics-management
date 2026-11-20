import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IntegrationBookAppointmentDto } from "../integrations/dto/integration-book-appointment.dto";
import { MarketplaceApiService } from "./marketplace-api.service";
import { MarketplaceProviderProfileService } from "./marketplace-provider-profile.service";
import { MarketplaceAuthGuard } from "./marketplace-auth.guard";
import { MarketplaceClient } from "./marketplace-client.decorator";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import { SlotHoldService } from "./slot-hold.service";
import { MarketplaceBookingService, type MarketplaceBookingBody } from "./marketplace-booking.service";
import { KiorexReviewsService, type ReviewAggregateBody } from "./kiorex-reviews.service";
import { KiorexOverviewService, type ProfileViewsBody } from "./kiorex-overview.service";
import { KiorexDepositsService, type DepositPaidBody, type PayoutBody } from "../billing/kiorex-deposits.service";
import { RecordShareService } from "./record-share.service";
import { SlotCapacityService } from "./slot-capacity.service";
import { CarePlanRequestService, type CarePlanRequestBody } from "../nurse/care-plan-request.service";
import { LabSampleService, type LabStatusPush } from "../nurse/lab-sample.service";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplaceWaitlistService, type MarketplaceWaitlistJoinBody } from "./marketplace-waitlist.service";

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
    private readonly reviews: KiorexReviewsService,
    private readonly overview: KiorexOverviewService,
    private readonly kiorexDeposits: KiorexDepositsService,
    private readonly recordShare: RecordShareService,
    private readonly slotCapacity: SlotCapacityService,
    private readonly waitlist: MarketplaceWaitlistService,
    private readonly carePlanRequests: CarePlanRequestService,
    private readonly labSamples: LabSampleService,
    private readonly access: MarketplaceAccessService,
  ) {}

  @Post("care-plan-requests")
  @HttpCode(200)
  @ApiOperation({ summary: "DRAFT (P3, Nurse edition): request a multi-visit care plan; idempotent on requestRef; 403 FEATURE_DISABLED until nurse.care_plans (gate GKN1) is effective" })
  async createCarePlanRequest(@Body() body: CarePlanRequestBody) {
    if (!body?.clinicId?.trim()) throw new BadRequestException("clinicId is required");
    const tenantId = await this.access.resolveTenantForMarketplaceClinic(body.clinicId, body.clinicianId);
    return this.carePlanRequests.receive(tenantId, body);
  }

  /** KNLAB01 (contracts 1.6.0): Kiorex relays the lab's status + sanitized custody (+ secure link on release) for a Nurse-edition hand-off. Idempotent, monotonic. */
  @Post("lab-orders/:orderId/status")
  @HttpCode(200)
  @ApiOperation({ summary: "Kiorex relays the lab status/custody of a nurse-collected hand-off (no results, no PHI)" })
  async labOrderStatus(@Param("orderId") orderId: string, @Body() body: LabStatusPush) {
    return this.labSamples.applyLabStatus(orderId, body);
  }

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
    @Query("serviceLocation") serviceLocation?: string,
    @Query("district") district?: string,
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
  ) {
    return this.api.listSlots(client, clinicId, clinicianId, typeId, from, to, { serviceLocation, district, lat, lng });
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

  @Post("bookings/:externalRef/deposit-paid")
  @HttpCode(200)
  @ApiOperation({ summary: "Patient paid a deposit on Kiorex Pay; held for the clinic until check-in (KX-07)" })
  depositPaid(
    @MarketplaceClient() client: PlatformIntegrationPrincipal,
    @Param("externalRef") externalRef: string,
    @Body() body: DepositPaidBody,
  ) {
    return this.kiorexDeposits.depositPaid(client.id, externalRef, body);
  }

  @Post("deposit-links/:token/paid")
  @HttpCode(200)
  @ApiOperation({ summary: "Patient paid a clinic deposit link through Kiorex Pay (FS-04); idempotent on paymentRef" })
  depositLinkPaid(@Param("token") token: string, @Body() body: DepositPaidBody) {
    return this.kiorexDeposits.depositLinkPaid(token, body);
  }

  @Post("payouts")
  @HttpCode(200)
  @ApiOperation({ summary: "Kiorex paid the clinic out for collected deposits (KX-07); idempotent on payoutRef" })
  recordPayout(@Body() body: PayoutBody) {
    return this.kiorexDeposits.recordPayout(body);
  }

  @Post("analytics/profile-views")
  @HttpCode(200)
  @ApiOperation({ summary: "Kiorex pushes daily profile views per doctor (KX-10); re-sending a day replaces it" })
  syncProfileViews(@MarketplaceClient() client: PlatformIntegrationPrincipal, @Body() body: ProfileViewsBody) {
    return this.overview.syncProfileViews(client, body);
  }

  @Post("reviews/aggregate")
  @HttpCode(200)
  @ApiOperation({ summary: "Kiorex pushes a doctor's rating aggregate and verified reviews (KX-08)" })
  syncReviews(@MarketplaceClient() client: PlatformIntegrationPrincipal, @Body() body: ReviewAggregateBody) {
    return this.reviews.syncAggregate(client, body);
  }

  @Get("analytics/slot-capacity")
  @ApiOperation({ summary: "Open marketplace slots per clinician per clinic-local day, for Kiorex liquidity (slots/day)" })
  slotCapacityCounts(
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("clinicId") clinicId?: string,
    @Query("clinicianId") clinicianId?: string,
  ) {
    return this.slotCapacity.capacity({ from, to, clinicId, clinicianId });
  }

  @Post("waitlist")
  @HttpCode(200)
  @ApiOperation({ summary: "Kiorex patient joins a clinic/doctor waitlist; idempotent on externalRef" })
  joinWaitlist(@MarketplaceClient() client: PlatformIntegrationPrincipal, @Body() body: MarketplaceWaitlistJoinBody) {
    return this.waitlist.join(client, body);
  }

  @Get("waitlist/:externalRef")
  @ApiOperation({ summary: "Get a Kiorex waitlist entry" })
  getWaitlist(@MarketplaceClient() client: PlatformIntegrationPrincipal, @Param("externalRef") externalRef: string) {
    return this.waitlist.get(client, externalRef);
  }

  @Delete("waitlist/:externalRef")
  @ApiOperation({ summary: "Kiorex patient leaves the waitlist; idempotent, withdraws any pending offer" })
  leaveWaitlist(@MarketplaceClient() client: PlatformIntegrationPrincipal, @Param("externalRef") externalRef: string) {
    return this.waitlist.leave(client, externalRef);
  }

  @Post("waitlist/offers/:offerId/accept")
  @HttpCode(200)
  @ApiOperation({ summary: "Patient accepts a WAITLIST_OFFER: books the slot as a Kiorex booking (outcome BOOKED | UNAVAILABLE)" })
  acceptWaitlistOffer(@MarketplaceClient() client: PlatformIntegrationPrincipal, @Param("offerId") offerId: string) {
    return this.waitlist.acceptOffer(client, offerId);
  }

  @Post("waitlist/offers/:offerId/decline")
  @HttpCode(200)
  @ApiOperation({ summary: "Patient declines a WAITLIST_OFFER; the slot goes to the next person" })
  declineWaitlistOffer(@MarketplaceClient() client: PlatformIntegrationPrincipal, @Param("offerId") offerId: string) {
    return this.waitlist.declineOffer(client, offerId);
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

  /** KX-11 — Kiorex patient-app consent scopes for record sharing. */
  @Post("patients/:id/consents")
  @ApiOperation({ summary: "Upsert record-share consents from the Kiorex patient app" })
  async upsertRecordShareConsents(
    @Param("id") patientId: string,
    @Body() body: { consents: { scope: string; granted: boolean }[] },
  ) {
    return this.recordShare.upsertFromMarketplace(patientId, body?.consents ?? []);
  }
}