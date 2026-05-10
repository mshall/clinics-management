#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { KiorlyClinicsManagementStack } from "./kiorly-clinics-management-stack";

const app = new cdk.App();

// Frankfurt (eu-central-1). Override with `-c deployRegion=...` only if you intentionally deploy elsewhere.
const deploymentRegion =
  (app.node.tryGetContext("deployRegion") as string | undefined) ?? "eu-central-1";
const account = process.env.CDK_DEFAULT_ACCOUNT ?? process.env.AWS_ACCOUNT_ID;

new KiorlyClinicsManagementStack(app, "kiorly-clinics-management", {
  ...(account ? { env: { account, region: deploymentRegion } } : { env: { region: deploymentRegion } }),
  deploymentRegion,
  description: "Kiorly clinics: eu-central-1, RDS PostgreSQL, App Runner API, S3+CloudFront (no NAT/ALB)",
});

app.synth();
