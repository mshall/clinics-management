import * as fs from "node:fs";
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cr from "aws-cdk-lib/custom-resources";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import { appRunnerPhysicalNames } from "./apprunner-physical-names";
import { loadClinicEnvConfig, wiringEnvVars, wiringSecretNames } from "./env-wiring";

export interface KiorlyClinicsManagementStackProps extends cdk.StackProps {
  /** AWS region for VPC/RDS/App Runner (Frankfurt = eu-central-1). */
  deploymentRegion: string;
  /** Logical host cell id (frankfurt | cairo) — SC-01 data residency tagging. */
  hostCell: string;
  /** API/RDS clock timezone for the cell. */
  runtimeTimezone: string;
}

function resolveWebBuildId(scope: Construct, assetPath: string): string | undefined {
  const fromCtx = scope.node.tryGetContext("webBuildId") as string | undefined;
  if (fromCtx?.trim()) return fromCtx.trim().slice(0, 64);
  const idFile = path.join(assetPath, "apps/web/.build-id");
  try {
    if (fs.existsSync(idFile)) {
      const id = fs.readFileSync(idFile, "utf8").trim();
      if (id) return id.slice(0, 64);
    }
  } catch {
    /* optional at synth time */
  }
  return undefined;
}

export class KiorlyClinicsManagementStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: KiorlyClinicsManagementStackProps) {
    super(scope, id, props);

    const { deploymentRegion, hostCell, runtimeTimezone } = props;

    // Do not use Tags.of(stack) — it tags App Runner resources and CloudFormation replaces them (AlreadyExists).
    const tagCellResources = (scope: Construct) => {
      cdk.Tags.of(scope).add("KiorlyHostCell", hostCell);
      cdk.Tags.of(scope).add("KiorlyDataRegion", deploymentRegion);
      cdk.Tags.of(scope).add("KiorlyStackRole", "clinic-platform-cell");
    };

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "Database", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });
    tagCellResources(vpc);

    vpc.addGatewayEndpoint("S3Gateway", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    const webBucket = new s3.Bucket(this, "WebBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    cdk.Tags.of(webBucket).add("KiorlyDataClass", "web-static");
    cdk.Tags.of(webBucket).add("KiorlyHostCell", hostCell);
    tagCellResources(webBucket);

    // Phase 1 storage hygiene (feat/storage-growth). Mirrors infra/tofu/modules/aws/object-storage
    // for the still-live CDK uploads bucket.
    //
    // Dr Ahmed Shall / AWS data safety: this is an in-place Bucket UPDATE (versioning + lifecycle +
    // metrics). RETAIN — never DESTROY / never autoDeleteObjects. Lifecycle must NOT ExpirationInDays
    // on patients/|encounters/|operations/ current versions (only Intelligent-Tiering + noncurrent
    // cleanup). Existing clinic blobs (including Dr Ahmed Shall Group) stay readable; deploy must not
    // replace or empty this bucket.
    //
    // PROPOSAL defaults: noncurrent 90d / keep 3; Intelligent-Tiering after 30d (≥128 KiB);
    // imports/ 30d; pending/ 1d. CORS origins empty until Phase 5 (no open CORS).
    const uploadsIntelligentTierAfter = cdk.Duration.days(30);
    const uploadsNoncurrentExpire = cdk.Duration.days(90);
    const apiUploadsBucket = new s3.Bucket(this, "ApiUploadsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      // Keep live tenant uploads (Dr Ahmed Shall Group PHI docs) across stack updates/deletes.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: "abort-incomplete-multipart",
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
          enabled: true,
        },
        {
          id: "expire-noncurrent-versions",
          noncurrentVersionExpiration: uploadsNoncurrentExpire,
          noncurrentVersionsToRetain: 3,
          enabled: true,
        },
        {
          id: "expire-delete-markers",
          expiredObjectDeleteMarker: true,
          enabled: true,
        },
        ...(["patients/", "encounters/", "operations/", "imports/"] as const).map((prefix) => ({
          id: `tier-to-intelligent-${prefix.replace(/\/$/, "").replace(/\//g, "-")}`,
          prefix,
          objectSizeGreaterThan: 131072,
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: uploadsIntelligentTierAfter,
            },
          ],
          enabled: true,
        })),
        {
          id: "expire-imports",
          prefix: "imports/",
          expiration: cdk.Duration.days(30),
          enabled: true,
        },
        {
          id: "expire-pending",
          prefix: "pending/",
          expiration: cdk.Duration.days(1),
          enabled: true,
        },
      ],
      metrics: [{ id: "EntireBucket" }],
    });
    cdk.Tags.of(apiUploadsBucket).add("KiorlyDataClass", "tenant-uploads");
    cdk.Tags.of(apiUploadsBucket).add("KiorlyHostCell", hostCell);
    tagCellResources(apiUploadsBucket);

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

    /**
     * JSON field `apiKey`. Created/updated by scripts/configure-apprunner-openai.sh
     * (import by name so re-deploy does not fail when the secret already exists).
     */
    const openAiSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "OpenAiApiKey",
      `${id}/openai-api-key`,
    );

    const dbParams = new rds.ParameterGroup(this, "DbParams", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      parameters: {
        timezone: runtimeTimezone,
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
      multiAz: true,
      credentials: rds.Credentials.fromGeneratedSecret("clinicapp"),
      databaseName: "clinic",
      /** RDS automated backup window (AWS max 35d). Longer medical-record retention uses snapshot/export runbooks. */
      backupRetention: cdk.Duration.days(35),
      deleteAutomatedBackups: false,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: true,
      cloudwatchLogsExports: ["postgresql"],
    });
    cdk.Tags.of(db).add("KiorlyDataClass", "primary-database");
    cdk.Tags.of(db).add("KiorlyHostCell", hostCell);
    tagCellResources(db);

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

    // DnsEntries[0] is "HostedZoneId:dnsName" — take the dnsName segment only.
    const vpceHostnameFromEndpoint = (endpoint: ec2.InterfaceVpcEndpoint) => {
      const cfn = endpoint.node.defaultChild as ec2.CfnVPCEndpoint;
      const firstPair = cdk.Fn.select(0, cfn.attrDnsEntries);
      return cdk.Fn.select(1, cdk.Fn.split(":", firstPair));
    };
    const secretsManagerVpceHost = vpceHostnameFromEndpoint(secretsManagerEndpoint);
    const kmsVpceHost = vpceHostnameFromEndpoint(kmsEndpoint);

    // EC2 GroupDescription must be ASCII-only (em-dash / UTF-8 fails CREATE with InvalidRequest).
    const dbSeedLambdaSg = new ec2.SecurityGroup(this, "DbSeedLambdaSg", {
      vpc,
      description: "Post-deploy Prisma seed Lambda - RDS + VPC endpoints",
      allowAllOutbound: true,
    });
    db.connections.allowFrom(dbSeedLambdaSg, ec2.Port.tcp(5432), "Post-deploy seed Lambda to PostgreSQL");
    secretsManagerEndpoint.connections.allowFrom(
      dbSeedLambdaSg,
      ec2.Port.tcp(443),
      "Seed Lambda GetSecretValue",
    );
    kmsEndpoint.connections.allowFrom(dbSeedLambdaSg, ec2.Port.tcp(443), "Seed Lambda KMS decrypt for Secrets Manager");

    const dbSeedFn = new lambda.DockerImageFunction(this, "DbSeedFn", {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, "..", ".."), {
        file: "apps/api/Dockerfile.seed",
        platform: ecr_assets.Platform.LINUX_AMD64,
        cacheFrom: [{ type: "gha", params: { scope: "kiorly-seed-image" } }],
        cacheTo: { type: "gha", params: { mode: "max", scope: "kiorly-seed-image" } },
      }),
      timeout: cdk.Duration.minutes(15),
      memorySize: 3008,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSeedLambdaSg],
      environment: {
        DB_SECRET_ARN: db.secret!.secretArn,
        SECRETS_MANAGER_VPCE_HOST: secretsManagerVpceHost,
        KMS_VPCE_HOST: kmsVpceHost,
        PRISMA_SEED_ENSURE_DEMO_PASSWORDS: "true",
      },
    });
    db.secret!.grantRead(dbSeedFn);
    dbSeedFn.node.addDependency(db);
    dbSeedFn.node.addDependency(kmsEndpoint);

    // App Runner tasks often still resolve regional hostnames to public IPs; private DNS for VPCE
    // is not always applied the same as on EC2. Pass VPCE DNS hostnames only (no https://, no zone id)
    // so App Runner env values never embed "HostedZoneId:host" URL quirks.
    const stsVpceHost = vpceHostnameFromEndpoint(stsEndpoint);

    const appRunnerNames = appRunnerPhysicalNames(hostCell);
    const publicSubnetIds = vpc
      .selectSubnets({ subnetType: ec2.SubnetType.PUBLIC })
      .subnetIds.slice()
      .sort();

    const vpcConnector = new apprunner.CfnVpcConnector(this, "AppRunnerVpcConnector", {
      vpcConnectorName: appRunnerNames.vpcConnectorName,
      subnets: publicSubnetIds,
      securityGroups: [connectorSg.securityGroupId],
    });

    const assetPath = path.join(__dirname, "..", "..");
    const webBuildId = resolveWebBuildId(this, assetPath);
    const imageAsset = new ecr_assets.DockerImageAsset(this, "ApiImage", {
      directory: assetPath,
      file: "apps/api/Dockerfile",
      // App Runner provisions x86_64 instances for this service shape; ARM-only images fail health checks.
      platform: ecr_assets.Platform.LINUX_AMD64,
      // GitHub Actions Buildx GHA cache — cuts cold `npm ci` layers on API image rebuilds.
      cacheFrom: [{ type: "gha", params: { scope: "kiorly-api-image" } }],
      cacheTo: { type: "gha", params: { mode: "max", scope: "kiorly-api-image" } },
    });

    const accessRole = new iam.Role(this, "AppRunnerEcrAccess", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSAppRunnerServicePolicyForECRAccess"),
      ],
    });

    const instanceRole = new iam.Role(this, "AppRunnerInstance", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
      description: "Runtime access to Secrets Manager for DB + JWT + OpenAI",
    });
    instanceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"),
    );
    db.secret!.grantRead(instanceRole);
    jwtSecret.grantRead(instanceRole);
    openAiSecret.grantRead(instanceRole);

    // Environment wiring (Passport, CORS, Kiorex URLs, partner registration): values from infra/config/*.json (generated from the URL
    // registry, no secrets), secrets by reference (Secrets Manager name + JSON key). No config file = nothing added.
    const wiring = loadClinicEnvConfig(path.join(__dirname, "..", "config"));
    const wiringSecrets = new Map(
      wiringSecretNames(wiring).map((name, i) => {
        const secret = secretsmanager.Secret.fromSecretNameV2(this, `WiringSecret${i}`, name);
        secret.grantRead(instanceRole);
        return [name, secret] as const;
      }),
    );
    apiUploadsBucket.grantReadWrite(instanceRole);

    // App Runner: reference JSON key so JWT_SECRET is a plain string (matches JwtModule + Passport JwtStrategy).
    const jwtSecretFieldArn = `${jwtSecret.secretArn}:jwt::`;
    const openAiApiKeyFieldArn = `${openAiSecret.secretArn}:apiKey::`;

    const apiObservability = new apprunner.CfnObservabilityConfiguration(this, "ApiObservability", {
      observabilityConfigurationName: appRunnerNames.observabilityName,
    });

    const apiAutoScalingName = appRunnerNames.autoScalingName;
    const apiAutoScaling = new apprunner.CfnAutoScalingConfiguration(this, "ApiAutoScaling", {
      autoScalingConfigurationName: apiAutoScalingName,
      maxConcurrency: 100,
      maxSize: 25,
      minSize: 1,
    });
    // Avoid Fn::GetAtt AutoScalingConfigurationArn on CfnService — CloudFormation can fail resolving it
    // ("The security token included in the request is invalid") even when the config exists. App Runner
    // accepts a name-only ARN and uses the latest active revision (same as our CfnAutoScalingConfiguration).
    // @see https://github.com/aws/aws-cdk/issues/34275
    const apiAutoScalingArn = cdk.Fn.join("", [
      "arn:",
      cdk.Aws.PARTITION,
      ":apprunner:",
      cdk.Aws.REGION,
      ":",
      cdk.Aws.ACCOUNT_ID,
      `:autoscalingconfiguration/${apiAutoScalingName}`,
    ]);

    const appRunnerService = new apprunner.CfnService(this, "ApiService", {
      serviceName: `kiorly-api-${cdk.Names.uniqueId(this).slice(-8).toLowerCase()}`,
      observabilityConfiguration: {
        observabilityEnabled: false,
      },
      autoScalingConfigurationArn: apiAutoScalingArn,
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
              { name: "KIORLY_DEPLOY_TARGET", value: "aws" },
              { name: "PORT", value: "3000" },
              { name: "SWAGGER_ENABLED", value: "false" },
              { name: "TZ", value: runtimeTimezone },
              { name: "KIORLY_HOST_CELL", value: hostCell },
              { name: "AWS_REGION", value: deploymentRegion },
              { name: "AWS_DEFAULT_REGION", value: deploymentRegion },
              { name: "SECRETS_MANAGER_VPCE_HOST", value: secretsManagerVpceHost },
              { name: "KMS_VPCE_HOST", value: kmsVpceHost },
              { name: "STS_VPCE_HOST", value: stsVpceHost },
              { name: "DB_SECRET_ARN", value: db.secret!.secretArn },
              // Match stable App Runner revision: migrate on boot with interim health listener in entrypoint.
              { name: "PRISMA_MIGRATE_ON_BOOT", value: "true" },
              // Demo seed via post-deploy DbSeedFn Lambda — boot seed blocks Nest and exceeds App Runner deploy window.
              { name: "PRISMA_SEED_ON_BOOT", value: "false" },
              { name: "UPLOAD_STORAGE", value: "s3" },
              { name: "S3_UPLOAD_BUCKET", value: apiUploadsBucket.bucketName },
              { name: "OPENAI_MODEL", value: "gpt-4o-mini" },
              ...(webBuildId ? [{ name: "WEB_BUILD_ID", value: webBuildId }] : []),
              ...wiringEnvVars(wiring),
            ],
            runtimeEnvironmentSecrets: [
              { name: "JWT_SECRET", value: jwtSecretFieldArn },
              { name: "OPENAI_API_KEY", value: openAiApiKeyFieldArn },
              ...Object.entries(wiring?.secrets ?? {})
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([name, ref]) => ({ name, value: `${wiringSecrets.get(ref.secretName)!.secretArn}:${ref.key}::` })),
            ],
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

    appRunnerService.node.addDependency(apiObservability);
    appRunnerService.node.addDependency(apiAutoScaling);
    appRunnerService.node.addDependency(vpcConnector);
    appRunnerService.node.addDependency(imageAsset);
    // the instance role's inline policy (secret read for the wiring secrets) must exist before App Runner resolves the references
    appRunnerService.node.addDependency(instanceRole);
    appRunnerService.node.addDependency(db);
    appRunnerService.node.addDependency(secretsManagerEndpoint);
    appRunnerService.node.addDependency(kmsEndpoint);
    appRunnerService.node.addDependency(stsEndpoint);

    // CloudFront needs the origin hostname only. Intrinsic-only parsing used CfnConditions on GetAtt(ServiceUrl),
    // which CloudFormation rejects ("Cannot reference resources in the Conditions block"). Parse at deploy time.
    const originHostParser = new lambda.Function(this, "AppRunnerOriginHostParser", {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "index.onEvent",
      timeout: cdk.Duration.seconds(30),
      code: lambda.Code.fromInline(`
exports.onEvent = async (event) => {
  if (event.RequestType === "Delete") {
    return { PhysicalResourceId: event.PhysicalResourceId ?? "deleted" };
  }
  const url = String(event.ResourceProperties.ServiceUrl ?? "");
  let host = url;
  const scheme = host.indexOf("://");
  if (scheme !== -1) host = host.slice(scheme + 3);
  const slash = host.indexOf("/");
  if (slash !== -1) host = host.slice(0, slash);
  host = host.trim();
  if (!host) throw new Error("Empty origin host from App Runner ServiceUrl");
  return { PhysicalResourceId: host.substring(0, 250), Data: { Host: host } };
};
`),
    });
    const originHostProvider = new cr.Provider(this, "AppRunnerOriginHostProvider", {
      onEventHandler: originHostParser,
    });
    const originHostResource = new cdk.CustomResource(this, "AppRunnerOriginHost", {
      serviceToken: originHostProvider.serviceToken,
      resourceType: "Custom::AppRunnerOriginHost",
      properties: { ServiceUrl: appRunnerService.attrServiceUrl },
    });
    originHostResource.node.addDependency(appRunnerService);
    const apiOriginDomain = originHostResource.getAttString("Host");

    // Do NOT use distribution-wide errorResponses (403/404 → index.html with 200): they apply to the App Runner
    // origin too, so API JSON (e.g. login) can be replaced by HTML while res.ok stays true — the SPA then crashes
    // on res.accessToken. SPA routing: viewer-request function on the S3 default behavior only rewrites non-/api,
    // non-asset paths to /index.html (see https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/example_cloudfront_functions_spa_url_rewrite_section.html).
    const spaViewerRewrite = new cloudfront.Function(this, "SpaViewerRewrite", {
      comment: "SPA deep links: serve index.html for paths without a file extension; leave /api/* unchanged",
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri || "";
  if (uri.startsWith("/api")) {
    return request;
  }
  if (uri.indexOf(".") !== -1) {
    return request;
  }
  request.uri = "/index.html";
  return request;
}
`),
      runtime: cloudfront.FunctionRuntime.JS_1_0,
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(webBucket, {
      originAccessLevels: [cloudfront.AccessLevel.READ],
    });

    const s3UncachedGetHead: cloudfront.BehaviorOptions = {
      origin: s3Origin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      compress: true,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
    };

    const dist = new cloudfront.Distribution(this, "SiteDistribution", {
      comment: "Kiorly clinic SPA + App Runner API (no ALB/NAT)",
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          { function: spaViewerRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        "/build-id.json": s3UncachedGetHead,
        "/index.html": s3UncachedGetHead,
        "/api/*": {
          origin: new origins.HttpOrigin(apiOriginDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            httpsPort: 443,
            originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
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
      description: `HTTPS URL: SPA and /api/* (cell ${hostCell}, region ${deploymentRegion})`,
    });

    new cdk.CfnOutput(this, "WebBucketName", {
      value: webBucket.bucketName,
      description: "SPA static hosting bucket (not ApiUploadsBucket — safe for web-only sync)",
    });

    new cdk.CfnOutput(this, "DistributionId", {
      value: dist.distributionId,
      description: "CloudFront distribution for SPA invalidation after web-only deploy",
    });

    new cdk.CfnOutput(this, "AppRunnerServiceUrl", {
      value: appRunnerService.attrServiceUrl,
      description: "Direct App Runner URL (prefer CloudFront AppUrl for users)",
    });

    new cdk.CfnOutput(this, "DbSecretArn", {
      value: db.secret!.secretArn,
    });

    new cdk.CfnOutput(this, "OpenAiSecretArn", {
      value: openAiSecret.secretArn,
      description: "Secrets Manager ARN for OpenAI apiKey; set with scripts/configure-apprunner-openai.sh",
    });

    new cdk.CfnOutput(this, "DbSeedFunctionName", {
      value: dbSeedFn.functionName,
      description: "Post-deploy idempotent Prisma seed Lambda (ensures demo org users on RDS)",
    });

    new cdk.CfnOutput(this, "HostCell", {
      value: hostCell,
      description: "Logical data residency cell (SC-01)",
    });

    new cdk.CfnOutput(this, "DataRegion", {
      value: deploymentRegion,
      description: "AWS region where RDS, S3, and backups for this cell reside",
    });

    new cdk.CfnOutput(this, "RegionNote", {
      value: `Cell ${hostCell}: all stack data stores in ${deploymentRegion}; runtime TZ=${runtimeTimezone}`,
    });
  }
}
