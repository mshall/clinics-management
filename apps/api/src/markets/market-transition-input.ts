import { BadRequestException } from "@nestjs/common";

export type TransitionInput = {
  reason: string;
  approvalRef: string | null;
  approvalLink: string | null;
  days?: number;
};

/** Reason is mandatory for every lifecycle change; approval reference and link are recorded when given. Hostile input is refused with a code the UI can translate. */
export function parseTransitionInput(raw: unknown, opts: { allowDays?: boolean } = {}): TransitionInput {
  const b = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const reason = typeof b.reason === "string" ? clean(b.reason) : "";
  if (reason.length < 3) throw new BadRequestException({ code: "REASON_REQUIRED", message: "A reason of at least 3 characters is required" });
  if (reason.length > 1000) throw new BadRequestException({ code: "REASON_TOO_LONG", message: "Reason is at most 1000 characters" });
  const approvalRef = optionalText(b.approvalRef, 128, "APPROVAL_REF_INVALID", "Approval reference is at most 128 characters");
  let approvalLink = optionalText(b.approvalLink, 500, "APPROVAL_LINK_INVALID", "Approval link is at most 500 characters");
  if (approvalLink) {
    let u: URL;
    try {
      u = new URL(approvalLink);
    } catch {
      throw new BadRequestException({ code: "APPROVAL_LINK_INVALID", message: "Approval link must be a full https:// address" });
    }
    if (u.protocol !== "https:") throw new BadRequestException({ code: "APPROVAL_LINK_INVALID", message: "Approval link must be a full https:// address" });
    approvalLink = u.toString();
  }
  let days: number | undefined;
  if (opts.allowDays) {
    if (b.days === undefined || b.days === null || b.days === "") days = 7;
    else if (typeof b.days === "number" && Number.isInteger(b.days) && b.days >= 1 && b.days <= 365) days = b.days;
    else throw new BadRequestException({ code: "PAUSE_DAYS_INVALID", message: "Pause length must be a whole number of days from 1 to 365" });
  }
  return { reason, approvalRef, approvalLink, days };
}

function optionalText(v: unknown, max: number, code: string, message: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new BadRequestException({ code, message });
  const t = clean(v);
  if (!t) return null;
  if (t.length > max) throw new BadRequestException({ code, message });
  return t;
}

/** Trim and drop NUL bytes (PostgreSQL text cannot hold them) and other control characters except newline and tab. */
function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}
