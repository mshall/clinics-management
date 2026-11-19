/** MN-05 — remittance auto-match helpers (pure). */

export type MatchableClaimLine = {
  id: string;
  externalRef: string;
  amountClaimed: number;
  status: string;
};

export type RemittanceImportRow = {
  externalRef: string;
  amount: number;
};

export type RemittanceMatchResult = {
  claimLineId: string | null;
  externalRef: string;
  amount: number;
  status: "MATCHED" | "UNMATCHED";
};

const OPEN_FOR_MATCH = new Set(["SUBMITTED", "ACCEPTED", "PENDING", "RESUBMITTED"]);

/** Match remittance rows to open claim lines: exact externalRef first, then unique amount. */
export function matchRemittanceLines(
  claimLines: MatchableClaimLine[],
  rows: RemittanceImportRow[],
): { matches: RemittanceMatchResult[]; matchedRatio: number } {
  const open = claimLines.filter((l) => OPEN_FOR_MATCH.has(l.status));
  const byRef = new Map<string, MatchableClaimLine[]>();
  for (const l of open) {
    const key = l.externalRef.trim().toUpperCase();
    const list = byRef.get(key) ?? [];
    list.push(l);
    byRef.set(key, list);
  }
  const used = new Set<string>();
  const matches: RemittanceMatchResult[] = [];

  for (const row of rows) {
    const ref = row.externalRef.trim().toUpperCase();
    let hit: MatchableClaimLine | undefined;
    const candidates = (byRef.get(ref) ?? []).filter((c) => !used.has(c.id));
    if (candidates.length === 1) {
      hit = candidates[0];
    } else if (candidates.length > 1) {
      hit = candidates.find((c) => Math.abs(c.amountClaimed - row.amount) < 0.005) ?? candidates[0];
    }
    if (!hit) {
      const amountHits = open.filter(
        (c) => !used.has(c.id) && Math.abs(c.amountClaimed - row.amount) < 0.005,
      );
      if (amountHits.length === 1) hit = amountHits[0];
    }
    if (hit) {
      used.add(hit.id);
      matches.push({
        claimLineId: hit.id,
        externalRef: row.externalRef,
        amount: row.amount,
        status: "MATCHED",
      });
    } else {
      matches.push({
        claimLineId: null,
        externalRef: row.externalRef,
        amount: row.amount,
        status: "UNMATCHED",
      });
    }
  }

  const matched = matches.filter((m) => m.status === "MATCHED").length;
  const matchedRatio = rows.length === 0 ? 1 : matched / rows.length;
  return { matches, matchedRatio };
}

export const PAYER_B2B_INVOICE_TOPIC = "billing.payer_b2b_invoice";
