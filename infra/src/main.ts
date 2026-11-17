#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { KiorlyClinicsManagementStack } from "./kiorly-clinics-management-stack";
import { resolveCellDeployConfig } from "./data-cells";

const app = new cdk.App();

const hostCell = (app.node.tryGetContext("hostCell") as string | undefined) ?? "frankfurt";
const deployRegionOverride = app.node.tryGetContext("deployRegion") as string | undefined;
const cellConfig = resolveCellDeployConfig(hostCell, deployRegionOverride);
const deploymentRegion = cellConfig.awsRegion;
const stackId = cellConfig.stackId;
const account = process.env.CDK_DEFAULT_ACCOUNT ?? process.env.AWS_ACCOUNT_ID;

new KiorlyClinicsManagementStack(app, stackId, {
  ...(account ? { env: { account, region: deploymentRegion } } : { env: { region: deploymentRegion } }),
  deploymentRegion,
  hostCell,
  runtimeTimezone: cellConfig.runtimeTimezone,
  description: `Kiorly clinics cell ${hostCell} (${deploymentRegion}): RDS, App Runner, S3+CloudFront`,
});

app.synth();
