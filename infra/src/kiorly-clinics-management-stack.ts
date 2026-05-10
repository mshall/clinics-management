import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

export interface KiorlyClinicsManagementStackProps extends cdk.StackProps {
  /** AWS region for VPC/RDS/App Runner (Frankfurt = eu-central-1). */
  deploymentRegion: string;
}

export class KiorlyClinicsManagementStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: KiorlyClinicsManagementStackProps) {
    super(scope, id, props);

    const { deploymentRegion } = props;

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "Database", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

    const webBucket = new s3.Bucket(this, "WebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const jwtSecret = new secretsmanager.Secret(this, "JwtSecret", {
      description: "JWT signing secret for Nest API (JSON jwt key; App Runner injects jwt field only)",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "jwt",
        excludeCharacters: "\"@/\\ ",
        passwordLength: 48,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const dbParams = new rds.ParameterGroup(this, "DbParams", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      parameters: {
        timezone: "Europe/Berlin",
      },
    });

    const db = new rds.DatabaseInstance(this, "Postgres", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      parameterGroup: dbParams,
      storageEncrypted: true,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      publiclyAccessible: false,
      multiAz: false,
      credentials: rds.Credentials.fromGeneratedSecret("clinicapp"),
      databaseName: "clinic",
      backupRetention: cdk.Duration.days(3),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: false,
      cloudwatchLogsExports: ["postgresql"],
    });

    const connectorSg = new ec2.SecurityGroup(this, "AppRunnerConnectorSg", {
      vpc,
      description: "App Runner VPC connector - outbound to RDS",
      allowAllOutbound: true,
    });

    db.connections.allowFrom(connectorSg, ec2.Port.tcp(5432), "App Runner connector to PostgreSQL");

    // App Runner VPC egress has no NAT; connector ENIs do not use a stable public path to reach
    // regional AWS APIs on the public internet. Private interface endpoints keep SDK traffic
    // (Secrets Manager for DATABASE_URL, KMS decrypt, STS for SigV4) inside the VPC.
    const awsApiEndpointSubnets = { subnetType: ec2.SubnetType.PRIVATE_ISOLATED };
    const secretsManagerEndpoint = vpc.addInterfaceEndpoint("SecretsManagerEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: awsApiEndpointSubnets,
      privateDnsEnabled: true,
    });
    secretsManagerEndpoint.connections.allowFrom(
      connectorSg,
      ec2.Port.tcp(443),
      "docker-entrypoint GetSecretValue for DB secret",
    );

    const kmsEndpoint = vpc.addInterfaceEndpoint("KmsEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.KMS,
      subnets: awsApiEndpointSubnets,
      privateDnsEnabled: true,
    });
    kmsEndpoint.connections.allowFrom(connectorSg, ec2.Port.tcp(443), "Secrets Manager / RDS decrypt");

    const stsEndpoint = vpc.addInterfaceEndpoint("StsEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.STS,
      subnets: awsApiEndpointSubnets,
      privateDnsEnabled: true,
    });
    stsEndpoint.connections.allowFrom(connectorSg, ec2.Port.tcp(443), "AWS SDK credential chain");

    // App Runner tasks often still resolve regional hostnames to public IPs; private DNS for VPCE
    // is not always applied the same as on EC2. Pass VPCE DNS hostnames only (no https://, no zone id)
    // so App Runner env values never embed "HostedZoneId:host" URL quirks.
    // DnsEntries[0] is "HostedZoneId:dnsName" — take the dnsName segment only.
    const vpceHostnameFromEndpoint = (endpoint: ec2.InterfaceVpcEndpoint) => {
      const cfn = endpoint.node.defaultChild as ec2.CfnVPCEndpoint;
      const firstPair = cdk.Fn.select(0, cfn.attrDnsEntries);
      return cdk.Fn.select(1, cdk.Fn.split(":", firstPair));
    };
    const secretsManagerVpceHost = vpceHostnameFromEndpoint(secretsManagerEndpoint);
    const kmsVpceHost = vpceHostnameFromEndpoint(kmsEndpoint);
    const stsVpceHost = vpceHostnameFromEndpoint(stsEndpoint);

    const vpcConnector = new apprunner.CfnVpcConnector(this, "AppRunnerVpcConnector", {
      vpcConnectorName: "kiorly-clinic-connector",
      subnets: vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).subnetIds,
      securityGroups: [connectorSg.securityGroupId],
    });

    const assetPath = path.join(__dirname, "..", "..");
    const imageAsset = new ecr_assets.DockerImageAsset(this, "ApiImage", {
      directory: assetPath,
      file: "apps/api/Dockerfile",
      // App Runner provisions x86_64 instances for this service shape; ARM-only images fail health checks.
      platform: ecr_assets.Platform.LINUX_AMD64,
    });

    const accessRole = new iam.Role(this, "AppRunnerEcrAccess", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSAppRunnerServicePolicyForECRAccess"),
      ],
    });

    const instanceRole = new iam.Role(this, "AppRunnerInstance", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
      description: "Runtime access to Secrets Manager for DB + JWT",
    });
    db.secret!.grantRead(instanceRole);
    jwtSecret.grantRead(instanceRole);

    // App Runner: reference JSON key so JWT_SECRET is a plain string (matches JwtModule + Passport JwtStrategy).
    const jwtSecretFieldArn = `${jwtSecret.secretArn}:jwt::`;

    const appRunnerService = new apprunner.CfnService(this, "ApiService", {
      serviceName: `kiorly-api-${cdk.Names.uniqueId(this).slice(-8).toLowerCase()}`,
      sourceConfiguration: {
        autoDeploymentsEnabled: false,
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: imageAsset.imageUri,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "3000",
            runtimeEnvironmentVariables: [
              { name: "NODE_ENV", value: "production" },
              { name: "PORT", value: "3000" },
              { name: "SWAGGER_ENABLED", value: "false" },
              { name: "TZ", value: "Europe/Berlin" },
              { name: "AWS_REGION", value: deploymentRegion },
              { name: "AWS_DEFAULT_REGION", value: deploymentRegion },
              { name: "SECRETS_MANAGER_VPCE_HOST", value: secretsManagerVpceHost },
              { name: "KMS_VPCE_HOST", value: kmsVpceHost },
              { name: "STS_VPCE_HOST", value: stsVpceHost },
              { name: "DB_SECRET_ARN", value: db.secret!.secretArn },
              // Apply migrations on each deploy so RDS is never missing tables (avoids silent boot + broken API).
              { name: "PRISMA_MIGRATE_ON_BOOT", value: "true" },
            ],
            runtimeEnvironmentSecrets: [{ name: "JWT_SECRET", value: jwtSecretFieldArn }],
          },
        },
      },
      instanceConfiguration: {
        // Cold Nest + Prisma migrate on boot needs more than 0.5 vCPU to stabilize within App Runner health windows.
        cpu: "1 vCPU",
        memory: "2 GB",
        instanceRoleArn: instanceRole.roleArn,
      },
      healthCheckConfiguration: {
        protocol: "HTTP",
        path: "/api/v1/health/live",
        interval: 10,
        timeout: 10,
        healthyThreshold: 1,
        // ~3.3 minutes of failing checks before NotStabilized (migrate + first Nest listen on cold start).
        unhealthyThreshold: 20,
      },
      networkConfiguration: {
        ingressConfiguration: { isPubliclyAccessible: true },
        egressConfiguration: {
          egressType: "VPC",
          vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
        },
      },
    });

    appRunnerService.node.addDependency(vpcConnector);
    appRunnerService.node.addDependency(imageAsset);
    appRunnerService.node.addDependency(db);
    appRunnerService.node.addDependency(secretsManagerEndpoint);
    appRunnerService.node.addDependency(kmsEndpoint);
    appRunnerService.node.addDependency(stsEndpoint);

    // ServiceUrl is https://<host> with no path — Fn::Select(2, Split("/", url)) fails (only 2 segments after https:).
    const apiOriginDomain = cdk.Fn.select(
      0,
      cdk.Fn.split("/", cdk.Fn.select(1, cdk.Fn.split("//", appRunnerService.attrServiceUrl))),
    );

    const dist = new cloudfront.Distribution(this, "SiteDistribution", {
      comment: "Kiorly clinic SPA + App Runner API (no ALB/NAT)",
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket, {
          originAccessLevels: [cloudfront.AccessLevel.READ],
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        "/api/*": {
          origin: new origins.HttpOrigin(apiOriginDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            httpsPort: 443,
            originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        },
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    new s3deploy.BucketDeployment(this, "WebDeploy", {
      sources: [s3deploy.Source.asset(path.join(assetPath, "apps/web/dist"))],
      destinationBucket: webBucket,
      distribution: dist,
      distributionPaths: ["/*"],
      prune: true,
      memoryLimit: 1024,
    });

    new cdk.CfnOutput(this, "AppUrl", {
      value: `https://${dist.distributionDomainName}`,
      description: "HTTPS URL: SPA and /api/* to App Runner (Frankfurt eu-central-1)",
    });

    new cdk.CfnOutput(this, "AppRunnerServiceUrl", {
      value: appRunnerService.attrServiceUrl,
      description: "Direct App Runner URL (prefer CloudFront AppUrl for users)",
    });

    new cdk.CfnOutput(this, "DbSecretArn", {
      value: db.secret!.secretArn,
    });

    new cdk.CfnOutput(this, "RegionNote", {
      value: "All resources in eu-central-1; DB timezone Europe/Berlin; runtime TZ=Europe/Berlin",
    });
  }
}
