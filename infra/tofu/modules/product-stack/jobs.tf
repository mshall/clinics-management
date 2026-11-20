# Scheduled jobs (kiorex-platform: outbox sweeps, settlement, hold expiry, reconciliation, ...).
# EventBridge Scheduler -> tiny Lambda -> POST <api>/<path> with X-Internal-Job-Key (secret injected into the API
# as INTERNAL_JOB_KEY). The API owns job logic; infrastructure only owns the clock.

data "archive_file" "jobs" {
  count       = local.has_jobs ? 1 : 0
  type        = "zip"
  output_path = "${path.module}/.tmp/${local.name}-jobs.zip"
  source {
    filename = "index.mjs"
    content  = <<-EOT
      import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
      const sm = new SecretsManagerClient({});
      let jobKey;
      export const handler = async (event) => {
        if (!jobKey) {
          const r = await sm.send(new GetSecretValueCommand({ SecretId: process.env.JOB_KEY_SECRET_ARN }));
          jobKey = JSON.parse(r.SecretString).key;
        }
        const res = await fetch(process.env.API_BASE_URL + event.path, {
          method: "POST",
          headers: { "content-type": "application/json", "x-internal-job-key": jobKey },
          body: JSON.stringify({ job: event.job, scheduledAt: new Date().toISOString() }),
        });
        if (!res.ok) throw new Error("job " + event.job + " failed with HTTP " + res.status);
        return { job: event.job, status: res.status };
      };
    EOT
  }
}

resource "aws_cloudwatch_log_group" "jobs" {
  count             = local.has_jobs ? 1 : 0
  name              = "/aws/lambda/${local.name}-job-runner"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

resource "aws_iam_role" "jobs" {
  count              = local.has_jobs ? 1 : 0
  name               = "${local.name}-job-runner"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "jobs_logs" {
  count      = local.has_jobs ? 1 : 0
  role       = aws_iam_role.jobs[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "jobs" {
  count = local.has_jobs ? 1 : 0
  statement {
    sid       = "ReadJobKey"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [module.secrets.secret_arns["internal-jobs"]]
  }
  dynamic "statement" {
    for_each = contains(keys(local.kms), "secrets") ? [1] : []
    content {
      sid       = "DecryptSecretKey"
      actions   = ["kms:Decrypt"]
      resources = [local.kms["secrets"]]
    }
  }
}

resource "aws_iam_role_policy" "jobs" {
  count  = local.has_jobs ? 1 : 0
  name   = "read-job-key"
  role   = aws_iam_role.jobs[0].id
  policy = data.aws_iam_policy_document.jobs[0].json
}

resource "aws_lambda_function" "jobs" {
  count            = local.has_jobs ? 1 : 0
  function_name    = "${local.name}-job-runner"
  role             = aws_iam_role.jobs[0].arn
  runtime          = "nodejs24.x"
  handler          = "index.handler"
  filename         = data.archive_file.jobs[0].output_path
  source_code_hash = data.archive_file.jobs[0].output_base64sha256
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      API_BASE_URL       = "https://${module.container_service.service_url}"
      JOB_KEY_SECRET_ARN = module.secrets.secret_arns["internal-jobs"]
    }
  }

  tags       = local.tags
  depends_on = [aws_cloudwatch_log_group.jobs, aws_iam_role_policy_attachment.jobs_logs]
}

data "aws_iam_policy_document" "scheduler_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  count              = local.has_jobs ? 1 : 0
  name               = "${local.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_trust.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "scheduler" {
  count = local.has_jobs ? 1 : 0
  name  = "invoke-job-runner"
  role  = aws_iam_role.scheduler[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = aws_lambda_function.jobs[0].arn
    }]
  })
}

resource "aws_scheduler_schedule_group" "jobs" {
  count = local.has_jobs ? 1 : 0
  name  = "${local.name}-jobs"
  tags  = local.tags
}

resource "aws_scheduler_schedule" "job" {
  for_each                     = var.scheduled_jobs
  name                         = "${local.name}-${each.key}"
  group_name                   = aws_scheduler_schedule_group.jobs[0].name
  schedule_expression          = each.value.schedule
  schedule_expression_timezone = each.value.timezone
  state                        = each.value.enabled ? "ENABLED" : "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.jobs[0].arn
    role_arn = aws_iam_role.scheduler[0].arn
    input    = jsonencode({ job = each.key, path = each.value.path })
    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}
