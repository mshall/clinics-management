/**
 * App Runner connector / autoscale / observability names are unique per AWS account+region.
 * Frankfurt keeps stable legacy names that match the live stack — avoid renaming (replacement churn).
 */
export function appRunnerPhysicalNames(hostCell: string): {
  vpcConnectorName: string;
  autoScalingName: string;
  observabilityName: string;
} {
  if (hostCell === "frankfurt") {
    return {
      vpcConnectorName: "kiorly-clinic-connector",
      autoScalingName: "kiorly-api-autoscale",
      observabilityName: "kiorly-api-observability",
    };
  }
  const slug = hostCell.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return {
    vpcConnectorName: `kiorly-conn-${slug}`,
    autoScalingName: `kiorly-api-autoscale-${slug}`,
    observabilityName: `kiorly-api-obs-${slug}`,
  };
}