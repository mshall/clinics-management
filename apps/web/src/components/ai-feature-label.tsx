import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  AI_FEATURES,
  type AiFeatureDefinition,
  type AiFeatureId,
} from "@/lib/ai-feature-disclosure";
import { cn } from "@/lib/utils";

type Props = {
  featureId: AiFeatureId;
  className?: string;
  showDisclosure?: boolean;
};

export function aiFeatureDef(featureId: AiFeatureId): AiFeatureDefinition {
  return AI_FEATURES[featureId];
}

export function AiFeatureLabel({ featureId, className, showDisclosure = false }: Props) {
  const { t } = useTranslation();
  const def = AI_FEATURES[featureId];
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{t(def.titleKey)}</span>
        {def.showsAiBadge ? (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Sparkles className="size-3" aria-hidden />
            {t("aiFeatures.badge", "AI")}
          </Badge>
        ) : null}
      </div>
      {showDisclosure ? (
        <p className="text-xs text-muted-foreground leading-relaxed">{t(def.disclosureKey)}</p>
      ) : null}
    </div>
  );
}