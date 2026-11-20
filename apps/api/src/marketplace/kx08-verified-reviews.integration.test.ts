import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  AppointmentStatus,
  BookingSource,
  Gender,
  ListingStatus,
  PrismaClient,
  UserRole,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import type { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { OutboxEventService } from "../messaging/outbox-event.service";
import { AppointmentOutboxService } from "../messaging/appointment-outbox.service";
import { OUTBOX_EVENT } from "../messaging/outbox-event-types";
import type { JwtUser } from "../auth/jwt-user";
import { MarketplaceAccessService } from "./marketplace-access.service";
import { MarketplaceListingService } from "./marketplace-listing.service";
import { KiorexReviewsService, REVIEW_REJECT } from "./kiorex-reviews.service";
import type { PlatformIntegrationPrincipal } from "./platform-integration-client.service";
import { createPrismaClient } from "../prisma/create-prisma-client";

const prisma = createPrismaClient();
const prismaSvc = prisma as unknown as PrismaService;
const audit = new AuditService(prismaSvc);
const outbox = new OutboxEventService(prismaSvc);
const appointmentOutbox = new AppointmentOutboxService(outbox);
const reviews = new KiorexReviewsService(
  prismaSvc,
  new MarketplaceAccessService(prismaSvc),
  new MarketplaceListingService(prismaSvc, outbox),
  outbox,
  audit,
);

describe("KX-08 verified reviews after completed visits", () => {
  const suffix = `${Date.now()}`;
  let tenantId: string;
  let clinicId: string;
  let physicianId: string;
  let patientId: string;
  let owner: JwtUser;
  let client: PlatformIntegrationPrincipal;
  const ids: Record<string, string> = {};

  async function visit(status: AppointmentStatus, bookingSource: BookingSource = BookingSource.KIOREX_MARKETPLACE) {
    const row = await prisma.appointment.create({
      data: {
        tenantId,
        clinicId,
        patientId,
        clinicianId: physicianId,
        startsAt: new Date("2027-01-10T08:00:00.000Z"),
        status: AppointmentStatus.CHECKED_IN,
        bookingSource,
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({ where: { id: row.id }, data: { status } });
      await appointmentOutbox.emitStatusChange(
        {
          tenantId,
          appointmentId: row.id,
          clinicId,
          previousStatus: AppointmentStatus.CHECKED_IN,
          nextStatus: status,
          bookingSource,
          cancelledByPatient: false,
        },
        tx,
      );
    });
    return row.id;
  }

  const invitations = (appointmentId: string) =>
    prisma.outboxEvent.count({
      where: { tenantId, aggregateId: appointmentId, type: OUTBOX_EVENT.REVIEW_INVITATION_ELIGIBLE },
    });

  before(async () => {
    await prisma.$connect();
    client = await prisma.platformIntegrationClient.create({
      data: { name: `Kx08 ${suffix}`, clientKey: `plt_kx08_${suffix}`, secretHash: "x", scopes: ["MARKETPLACE"] },
    });
    const market = await prisma.market.findFirstOrThrow({ where: { code: "EG" } });
    const tenant = await prisma.tenant.create({
      data: { name: `Kx08 ${suffix}`, deploymentCell: "frankfurt", marketId: market.id },
    });
    tenantId = tenant.id;
    const clinic = await prisma.clinic.create({
      data: {
        tenantId,
        nameEn: "Branch",
        nameAr: "فرع",
        country: "EG",
        city: "Cairo",
        addressEn: "Street",
        addressAr: "شارع",
        locationUrl: "https://maps.example/kx08",
        phone: "201000000080",
        email: `kx08.${suffix}@example.com`,
        licenseNumber: "EG-KX08",
      },
    });
    clinicId = clinic.id;
    const physician = await prisma.user.create({
      data: {
        tenantId,
        email: `kx08.dr.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 4),
        displayName: "Dr Kx08",
        role: UserRole.PHYSICIAN,
      },
    });
    physicianId = physician.id;
    const ownerRow = await prisma.user.create({
      data: {
        tenantId,
        email: `kx08.owner.${suffix}@example.com`,
        passwordHash: bcrypt.hashSync("demo", 4),
        displayName: "Owner Kx08",
        role: UserRole.GROUP_ADMIN,
      },
    });
    owner = { userId: ownerRow.id, tenantId, email: ownerRow.email, role: UserRole.GROUP_ADMIN };
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        mrn: `KX08-${suffix}`,
        firstNameEn: "Mona",
        lastNameEn: "Test",
        gender: Gender.F,
        phone: `+2013${String(Date.now()).slice(-8)}`,
      },
    });
    patientId = patient.id;
    await prisma.marketplaceListing.create({
      data: { tenantId, clinicId, clinicianId: physicianId, status: ListingStatus.LIVE, profileJson: {} },
    });
    ids.completed = await visit(AppointmentStatus.COMPLETED);
    ids.noShow = await visit(AppointmentStatus.NO_SHOW);
    ids.cancelled = await visit(AppointmentStatus.CANCELLED);
    ids.frontDesk = await visit(AppointmentStatus.COMPLETED, BookingSource.FRONT_DESK);
  });

  after(async () => {
    await prisma.kiorexReview.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.kiorexRating.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.outboxEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.marketplaceListing.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.patient.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.clinic.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.platformIntegrationClient.delete({ where: { id: client.id } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("emits a review invitation event when a Kiorex visit is completed", async () => {
    assert.equal(await invitations(ids.completed!), 1);
  });

  it("no review invitation for no-shows, cancelled or non-Kiorex bookings", async () => {
    assert.equal(await invitations(ids.noShow!), 0);
    assert.equal(await invitations(ids.cancelled!), 0);
    assert.equal(await invitations(ids.frontDesk!), 0);
  });

  it("syncs the aggregate and keeps only reviews tied to a completed Kiorex visit", async () => {
    const res = await reviews.syncAggregate(client, {
      clinicId,
      clinicianId: physicianId,
      averageRating: 4.5,
      reviewCount: 12,
      reviews: [
        { reviewId: `r-ok-${suffix}`, appointmentId: ids.completed!, rating: 5, comment: "Great", createdAt: "2027-01-11T10:00:00Z" },
        { reviewId: `r-ns-${suffix}`, appointmentId: ids.noShow!, rating: 1, createdAt: "2027-01-11T10:00:00Z" },
        { reviewId: `r-cx-${suffix}`, appointmentId: ids.cancelled!, rating: 1, createdAt: "2027-01-11T10:00:00Z" },
        { reviewId: `r-hid-${suffix}`, appointmentId: ids.completed!, rating: 2, createdAt: "2027-01-12T10:00:00Z", moderationStatus: "HIDDEN" },
      ],
    });
    assert.deepEqual(res.accepted.sort(), [`r-hid-${suffix}`, `r-ok-${suffix}`].sort());
    assert.deepEqual(
      res.rejected.map((r) => r.reason),
      [REVIEW_REJECT.NOT_A_COMPLETED_VISIT, REVIEW_REJECT.NOT_A_COMPLETED_VISIT],
    );
    const view = await reviews.listForClinic(owner, clinicId);
    assert.deepEqual(view.overall, { averageRating: 4.5, reviewCount: 12 });
    assert.equal(view.doctors[0]?.clinicianName, "Dr Kx08");
    assert.deepEqual(
      view.reviews.map((r) => r.comment),
      ["Great"],
      "moderated (hidden) reviews are not shown",
    );
  });

  it("clinic reply is stored, sent to Kiorex through the outbox and audited", async () => {
    const view = await reviews.listForClinic(owner, clinicId);
    const target = view.reviews[0]!;
    const res = await reviews.reply(owner, target.id, "Thank you for visiting!");
    assert.equal(res.replyText, "Thank you for visiting!");
    const evt = await prisma.outboxEvent.findFirst({
      where: { tenantId, aggregateId: target.id, type: OUTBOX_EVENT.REVIEW_REPLY_POSTED },
    });
    assert.equal((evt?.payload as { kiorexReviewId?: string }).kiorexReviewId, `r-ok-${suffix}`);
    const audited = await prisma.auditLog.count({
      where: { tenantId, action: "kiorex.review.replied", resourceId: target.id, actorId: owner.userId },
    });
    assert.equal(audited, 1);
  });
});
