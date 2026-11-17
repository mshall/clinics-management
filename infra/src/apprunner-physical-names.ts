/**
 * App Runner connector / config names are unique per AWS account+region. The live frankfurt cell
 * already owns the legacy names; renaming triggers CloudFormation replacement (create-before-delete)
 * and fails with HandlerErrorCode AlreadyExists while the old connector still exists.
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