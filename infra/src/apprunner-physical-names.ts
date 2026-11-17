/**
 * App Runner connector / config names are unique per AWS account+region. The live frankfurt cell
 * already owns legacy autoscale/observability names. VPC connector replacement must use a new
 * global name (e.g. v2); create-before-delete with the same name fails HandlerErrorCode AlreadyExists.
 */
export function appRunnerPhysicalNames(hostCell: string): {
  vpcConnectorName: string;
  autoScalingName: string;
  observabilityName: string;
} {
  if (hostCell === "frankfurt") {
    return {
      // v2: subnet sort + stable naming requires CFN replacement; same-name create-before-delete hits AlreadyExists.
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