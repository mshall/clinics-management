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
import * as ses from "aws-cdk-lib/aws-ses";
import type { Construct } from "constructs";

export interface KiorlyClinicsManagementStackProps extends cdk.StackProps {
  /** AWS region for VPC/RDS/App Runner (Frankfurt = eu-central-1). */
  deploymentRegion: string;
  /** Email address for pre-deploy DB backup notifications (SES must verify this identity). */
  backupEmailTo?: string;
  /** SES From address; defaults to backupEmailTo when omitted. */
  backupEmailFrom?: string;
}

export class KiorlyClinicsManagementStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: KiorlyClinicsManagementStackProps) {
    super(scope, id, props);

    const { deploymentRegion } = props;
    const backupEmailTo =
      props.backupEmailTo ??
      (this.node.tryGetContext("backupEmailTo") as string | undefined) ??
      "kiorlyclinics@gmail.com";
    const backupEmailFrom =
      props.backupEmailFrom ??
      (this.node.tryGetContext("backupEmailFrom") as string | undefined) ??
      backupEmailTo;

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "Database", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });

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

    const apiUploadsBucket = new s3.Bucket(this, "ApiUploadsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
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
      backupRetention: cdk.Duration.days(7),
      deleteAutomatedBackups: false,
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

    const sesEndpoint = vpc.addInterfaceEndpoint("SesEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.SES,
      subnets: awsApiEndpointSubnets,
      privateDnsEnabled: true,
    });

    // DnsEntries[0] is "HostedZoneId:dnsName" — take the dnsName segment only.
    const vpceHostnameFromEndpoint = (endpoint: ec2.InterfaceVpcEndpoint) => {
      const cfn = endpoint.node.defaultChild as ec2.CfnVPCEndpoint;
      const firstPair = cdk.Fn.select(0, cfn.attrDnsEntries);
      return cdk.Fn.select(1, cdk.Fn.split(":", firstPair));
    };
    const secretsManagerVpceHost = vpceHostnameFromEndpoint(secretsManagerEndpoint);
    const kmsVpceHost = vpceHostnameFromEndpoint(kmsEndpoint);
    const sesVpceHost = vpceHostnameFromEndpoint(sesEndpoint);

    const dbBackupBucket = new s3.Bucket(this, "DbBackupBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ expiration: cdk.Duration.days(30) }],
    });

    // EC2 GroupDescription must be ASCII-only (em-dash / UTF-8 fails CREATE with InvalidRequest).
    const backupLambdaSg = new ec2.SecurityGroup(this, "DbBackupLambdaSg", {
      vpc,
      description: "Pre-deploy pg_dump Lambda - RDS + VPC endpoints",
      allowAllOutbound: true,
    });
    db.connections.allowFrom(backupLambdaSg, ec2.Port.tcp(5432), "Pre-deploy backup Lambda to PostgreSQL");
    sesEndpoint.connections.allowFrom(backupLambdaSg, ec2.Port.tcp(443), "Backup Lambda to SES");
    secretsManagerEndpoint.connections.allowFrom(
      backupLambdaSg,
      ec2.Port.tcp(443),
      "Backup Lambda GetSecretValue",
    );
    kmsEndpoint.connections.allowFrom(backupLambdaSg, ec2.Port.tcp(443), "Backup Lambda KMS decrypt for Secrets Manager");

    new ses.EmailIdentity(this, "BackupEmailFromIdentity", {
      identity: ses.Identity.email(backupEmailFrom),
    });
    if (backupEmailFrom.toLowerCase() !== backupEmailTo.toLowerCase()) {
      new ses.EmailIdentity(this, "BackupEmailToIdentity", {
        identity: ses.Identity.email(backupEmailTo),
      });
    }

    const dbBackupFn = new lambda.DockerImageFunction(this, "DbBackupFn", {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, "..", "lambda", "db-backup")),
      timeout: cdk.Duration.minutes(10),
      memorySize: 1024,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [backupLambdaSg],
      environment: {
        DB_SECRET_ARN: db.secret!.secretArn,
        BACKUP_EMAIL_TO: backupEmailTo,
        BACKUP_EMAIL_FROM: backupEmailFrom,
        BACKUP_BUCKET: dbBackupBucket.bucketName,
        // Isolated subnet has no NAT; explicit VPCE hosts match App Runner docker-entrypoint pattern.
        SECRETS_MANAGER_VPCE_HOST: secretsManagerVpceHost,
        KMS_VPCE_HOST: kmsVpceHost,
        SES_VPCE_HOST: sesVpceHost,
      },
    });
    db.secret!.grantRead(dbBackupFn);
    dbBackupBucket.grantReadWrite(dbBackupFn);
    dbBackupFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendRawEmail", "ses:SendEmail"],
        resources: ["*"],
      }),
    );
    dbBackupFn.node.addDependency(db);
    dbBackupFn.node.addDependency(kmsEndpoint);
    dbBackupFn.node.addDependency(sesEndpoint);

    const dbSeedFn = new lambda.DockerImageFunction(this, "DbSeedFn", {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, "..", ".."), {
        file: "apps/api/Dockerfile.seed",
        platform: ecr_assets.Platform.LINUX_AMD64,
      }),
      timeout: cdk.Duration.minutes(15),
      memorySize: 2048,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [backupLambdaSg],
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
    instanceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"),
    );
    db.secret!.grantRead(instanceRole);
    jwtSecret.grantRead(instanceRole);
    apiUploadsBucket.grantReadWrite(instanceRole);

    // App Runner: reference JSON key so JWT_SECRET is a plain string (matches JwtModule + Passport JwtStrategy).
    const jwtSecretFieldArn = `${jwtSecret.secretArn}:jwt::`;

    const apiObservability = new apprunner.CfnObservabilityConfiguration(this, "ApiObservability", {
      observabilityConfigurationName: "kiorly-api-observability",
    });

    const appRunnerService = new apprunner.CfnService(this, "ApiService", {
      serviceName: `kiorly-api-${cdk.Names.uniqueId(this).slice(-8).toLowerCase()}`,
      observabilityConfiguration: {
        observabilityEnabled: true,
        observabilityConfigurationArn: apiObservability.attrObservabilityConfigurationArn,
      },
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
              { name: "NEST_INTERNAL_PORT", value: "3001" },
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
              // Demo seed via post-deploy DbSeedFn Lambda — boot seed blocks Nest and exceeds App Runner deploy window.
              { name: "PRISMA_SEED_ON_BOOT", value: "false" },
              { name: "UPLOAD_STORAGE", value: "s3" },
              { name: "S3_UPLOAD_BUCKET", value: apiUploadsBucket.bucketName },
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
        // migrate + Nest cold start on deploy; demo seed runs in post-deploy DbSeedFn Lambda.
        // App Runner allows UnhealthyThreshold 1-20 only (CFN early validation rejects higher values).
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
    appRunnerService.node.addDependency(vpcConnector);
    appRunnerService.node.addDependency(imageAsset);
    appRunnerService.node.addDependency(db);
    appRunnerService.node.addDependency(secretsManagerEndpoint);
    appRunnerService.node.addDependency(kmsEndpoint);
    appRunnerService.node.addDependency(stsEndpoint);

    // CloudFront needs the origin hostname only. Intrinsic-only parsing used CfnConditions on GetAtt(ServiceUrl),
    // which CloudFormation rejects ("Cannot reference resources in the Conditions block"). Parse at deploy time.
    const originHostParser = new lambda.Function(this, "AppRunnerOriginHostParser", {
      runtime: lambda.Runtime.NODEJS_22_X,
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
  if (uri === "/" || uri === "") {
    return request;
  }
  request.uri = "/index.html";
  return request;
}
`),
      runtime: cloudfront.FunctionRuntime.JS_1_0,
    });

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
        functionAssociations: [
          { function: spaViewerRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
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
      description: "HTTPS URL: SPA and /api/* to App Runner (Frankfurt eu-central-1)",
    });

    new cdk.CfnOutput(this, "AppRunnerServiceUrl", {
      value: appRunnerService.attrServiceUrl,
      description: "Direct App Runner URL (prefer CloudFront AppUrl for users)",
    });

    new cdk.CfnOutput(this, "DbSecretArn", {
      value: db.secret!.secretArn,
    });

    new cdk.CfnOutput(this, "DbBackupFunctionName", {
      value: dbBackupFn.functionName,
      description: "Pre-deploy pg_dump Lambda (emails backup before CI deploy)",
    });

    new cdk.CfnOutput(this, "DbSeedFunctionName", {
      value: dbSeedFn.functionName,
      description: "Post-deploy idempotent Prisma seed Lambda (ensures demo org users on RDS)",
    });

    new cdk.CfnOutput(this, "DbBackupEmailTo", {
      value: backupEmailTo,
      description: "Verify this address in SES (inbox link) before backup emails succeed",
    });

    new cdk.CfnOutput(this, "RegionNote", {
      value: "All resources in eu-central-1; DB timezone Europe/Berlin; runtime TZ=Europe/Berlin",
    });
  }
}
