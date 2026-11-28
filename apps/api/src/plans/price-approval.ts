import { BadRequestException, ForbiddenException } from "@nestjs/common";

/** The maker-checker record the Kiorly admin sends with a price it publishes (the proposal lives in the Kiorex platform; the Clinic keeps the price and this trail). */
export type PriceApproval = { proposalId: string; proposedBy: string };

const REF = /^[A-Za-z0-9._:@+\-]{1,200}$/;

/** `actorId` is the already normalised actor id (`kiorly-admin:<console user>`). Refuses a missing record and an approver who is the proposer. */
export function approvalFromSignedBody(raw: unknown, actorId: string): PriceApproval {
  const a = raw as { proposalId?: unknown; proposedBy?: unknown } | null | undefined;
  const proposalId = typeof a?.proposalId === "string" ? a.proposalId.trim() : "";
  const proposedBy = typeof a?.proposedBy === "string" ? a.proposedBy.trim() : "";
  if (!REF.test(proposalId) || !REF.test(proposedBy)) {
    throw new BadRequestException({ code: "APPROVAL_REQUIRED", message: "A price is published only from an approved proposal (proposalId and proposedBy)" });
  }
  if (`kiorly-admin:${proposedBy}` === actorId) {
    throw new ForbiddenException({ code: "TWO_PERSON_RULE", message: "The person who proposed a price cannot approve it" });
  }
  return { proposalId, proposedBy };
}
