import {
  AI_FEATURES,
  type AiFeatureDefinition,
  type AiFeatureId,
} from "@/lib/ai-feature-disclosure";

export function aiFeatureDef(featureId: AiFeatureId): AiFeatureDefinition {
  return AI_FEATURES[featureId];
}
