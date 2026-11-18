import type { TFunction } from "i18next";

export type NoShowRiskBand = "LOW" | "MEDIUM" | "HIGH";
export type NoShowRiskFactor = "PRIOR_NO_SHOWS" | "DEPOSIT_FLAG" | "SHORT_NOTICE";

/** FS-05: mirrors the API `noShowRisk` field. `method` is RULE_BASED until a trained model ships. */
export type NoShowRiskView = {
  score: number;
  band: NoShowRiskBand;
  method: "RULE_BASED" | (string & {});
  factors: NoShowRiskFactor[];
  priorNoShows: number;
  suggestion: "DEPOSIT" | "EXTRA_REMINDER" | null;
};


export function noShowRiskMethodLabel(method: NoShowRiskView["method"], t: TFunction): string {
  return method === "RULE_BASED" ? t("noShowRisk.ruleBased", "rule-based") : t("noShowRisk.modelBased", "model estimate");
}

export function noShowRiskBandLabel(band: NoShowRiskBand, t: TFunction): string {
  return t(`noShowRisk.band.${band}`, band);
}

/** Visible chip text, e.g. "High no-show risk · rule-based". */
export function noShowRiskChipText(view: Pick<NoShowRiskView, "band" | "method">, t: TFunction): string {
  return `${noShowRiskBandLabel(view.band, t)} · ${noShowRiskMethodLabel(view.method, t)}`;
}

export function noShowRiskFactorsText(view: Pick<NoShowRiskView, "factors" | "priorNoShows">, t: TFunction): string {
  if (view.factors.length === 0) return t("noShowRisk.noFactors", "No previous no-shows on record.");
  return view.factors
    .map((f) =>
      f === "PRIOR_NO_SHOWS"
        ? t("noShowRisk.factor.PRIOR_NO_SHOWS", { count: view.priorNoShows, defaultValue: "{{count}} previous no-shows" })
        : t(`noShowRisk.factor.${f}`, f),
    )
    .join(" · ");
}

/** Tooltip / detail text: what the estimate is (and is not) and why this appointment got it. */
export function noShowRiskExplanation(view: NoShowRiskView, t: TFunction): string {
  const what =
    view.method === "RULE_BASED"
      ? t("noShowRisk.ruleBasedExplainer", "Rule-based estimate from a fixed formula — not a trained prediction model.")
      : t("noShowRisk.modelExplainer", "Estimate from a trained model.");
  return `${what} ${t("noShowRisk.basedOn", "Based on:")} ${noShowRiskFactorsText(view, t)}`;
}

export function noShowRiskSuggestionText(view: Pick<NoShowRiskView, "suggestion">, t: TFunction): string | null {
  if (view.suggestion === "DEPOSIT") return t("noShowRisk.suggestDeposit", "Consider asking for a deposit to hold this slot.");
  if (view.suggestion === "EXTRA_REMINDER")
    return t("noShowRisk.suggestReminder", "Consider an extra reminder call or message the day before.");
  return null;
}

export function noShowRiskChipClassName(band: NoShowRiskBand): string {
  switch (band) {
    case "HIGH":
      return "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300";
    case "MEDIUM":
      return "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    default:
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
  }
}
