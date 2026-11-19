import { useTranslation } from "react-i18next";
import { badgeVariants } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  noShowRiskChipClassName,
  noShowRiskChipText,
  noShowRiskExplanation,
  noShowRiskSuggestionText,
  type NoShowRiskView,
} from "@/lib/no-show-risk";
import { cn } from "@/lib/utils";

type Props = {
  risk: NoShowRiskView | null | undefined;
  className?: string;
  /** false inside another interactive element (e.g. a calendar card button): plain label with a native title. */
  interactive?: boolean;
};

/** FS-05 low / medium / high chip; the label always states how the estimate was made. */
export function NoShowRiskChip({ risk, className, interactive = true }: Props) {
  const { t } = useTranslation();
  if (!risk) return null;
  const explanation = noShowRiskExplanation(risk, t);
  const suggestion = noShowRiskSuggestionText(risk, t);
  const chipClass = cn(
    badgeVariants({ variant: "outline" }),
    "w-fit whitespace-nowrap font-normal",
    noShowRiskChipClassName(risk.band),
    className,
  );
  if (!interactive) {
    return (
      <span className={chipClass} data-testid="no-show-risk-chip" data-band={risk.band} title={explanation}>
        {noShowRiskChipText(risk, t)}
      </span>
    );
  }
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(chipClass, "cursor-help")}
            data-testid="no-show-risk-chip"
            data-band={risk.band}
            aria-label={`${noShowRiskChipText(risk, t)}. ${explanation}`}
          >
            {noShowRiskChipText(risk, t)}
          </button>
        </TooltipTrigger>
        <TooltipContent data-testid="no-show-risk-tooltip">
          <p>{explanation}</p>
          {suggestion ? <p className="mt-1 font-medium">{suggestion}</p> : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
