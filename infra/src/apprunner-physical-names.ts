/**
 * App Runner connector / config names are unique per AWS account+region. The live frankfurt stack
 * already owns `kiorly-clinic-connector`; renaming triggers CloudFormation replacement
 * (create-before-delete) and fails with HandlerErrorCode AlreadyExists when a prior attempt left
 * the old or interim name in the account. Keep frankfurt on the legacy connector name; avoid reordering
 * connector public subnets (lexicographic sort forced CFN replacement). CI deletes known orphan names before deploy.
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