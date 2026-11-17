/**
 * App Runner connector / config names are unique per AWS account+region. Stack-level tags on
 * `AWS::AppRunner::VpcConnector` force CloudFormation replacement (create-before-delete). Using the
 * same global name as the live connector fails with HandlerErrorCode AlreadyExists. Frankfurt uses
 * `kiorly-clinic-connector-v2`; the stack excludes residency tags from the connector via
 * `excludeStackResidencyTags`; CI removes orphan interim connectors before deploy.
 */
export function appRunnerPhysicalNames(hostCell: string): {
  vpcConnectorName: string;
  autoScalingName: string;
  observabilityName: string;
} {
  if (hostCell === "frankfurt") {
    return {
      vpcConnectorName: "kiorly-clinic-connector-v2",
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