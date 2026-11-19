variable "name" {
  description = "Name prefix (e.g. kiorly-clinic-prod). Service = <name>-api; keep <= 33 chars."
  type        = string
}

variable "image_tag" {
  description = "Image tag in the module's ECR repository (git sha). Built and pushed by CI before the service is created."
  type        = string
}

variable "port" {
  description = "Container port."
  type        = number
  default     = 3000
}

variable "cpu" {
  description = "App Runner vCPU units (1024 = 1 vCPU)."
  type        = string
  default     = "1024"
}

variable "memory" {
  description = "App Runner memory MB."
  type        = string
  default     = "2048"
}

variable "min_size" {
  description = "Minimum instances (prod: 2 - HB04)."
  type        = number
  default     = 1
}

variable "max_size" {
  description = "Maximum instances."
  type        = number
  default     = 25
}

variable "max_concurrency" {
  description = "Concurrent requests per instance before scale-out."
  type        = number
  default     = 100
}

variable "health_path" {
  description = "HTTP health check path."
  type        = string
  default     = "/api/v1/health/live"
}

variable "environment" {
  description = "Plain runtime environment variables."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Runtime secrets: env var name => Secrets Manager ARN (optionally with :jsonKey:: suffix)."
  type        = map(string)
  default     = {}
}

variable "secret_read_arns" {
  description = "Secret ARNs (without the :key:: suffix) the instance role may read."
  type        = list(string)
  default     = []
}

variable "bucket_arns" {
  description = "S3 bucket ARNs the instance role may read/write."
  type        = list(string)
  default     = []
}

variable "kms_key_arns" {
  description = "KMS keys the instance role may use (secrets, uploads)."
  type        = list(string)
  default     = []
}

variable "extra_policy_json" {
  description = "Additional IAM policy JSON documents merged into the instance role policy (e.g. SES send)."
  type        = list(string)
  default     = []
}

variable "enable_vpc_connector" {
  description = "Route egress through a VPC connector (needed to reach RDS). When false egress is DEFAULT (public internet)."
  type        = bool
  default     = true
}

variable "connector_subnet_ids" {
  description = "Subnets for the VPC connector ENIs (public subnets, as built)."
  type        = list(string)
  default     = []
}

variable "connector_security_group_ids" {
  description = "Security groups for the VPC connector."
  type        = list(string)
  default     = []
}

variable "observability_enabled" {
  description = "Enable X-Ray tracing via the App Runner observability configuration."
  type        = bool
  default     = true
}

variable "extra_ecr_repositories" {
  description = "Additional ECR repositories (full names), e.g. the non-prod seed Lambda image."
  type        = set(string)
  default     = []
}

variable "ecr_kms_key_arn" {
  description = "Customer-managed KMS key for ECR (null = AES256)."
  type        = string
  default     = null
}

variable "ecr_keep_images" {
  description = "Lifecycle: number of images to keep (KX-21 §07: 30)."
  type        = number
  default     = 30
}

variable "force_delete_repository" {
  description = "Allow deleting repositories that still hold images (non-prod)."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
