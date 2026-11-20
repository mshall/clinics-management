variable "name" {
  description = "Name prefix (<product>-<env>)."
  type        = string
}

variable "role" {
  description = "producer = the product that raises and delivers safety alerts (Kiorly Clinic / Nurse edition); consumer = a product that receives SAFETY_ALERT_RAISED over the outbox (Kiorex ops console)."
  type        = string
  validation {
    condition     = contains(["producer", "consumer"], var.role)
    error_message = "role must be producer or consumer."
  }
}

variable "application_log_group_name" {
  description = "CloudWatch log group that carries the API's structured JSON application logs (App Runner: /aws/apprunner/<service>/<id>/application)."
  type        = string
}

variable "latency_threshold_ms" {
  description = "Delivery SLA in milliseconds (KX-09 / KX-23: SAFETY_ALERT_RAISED is delivered within 60 s)."
  type        = number
  default     = 60000
}

variable "sns_kms_key_id" {
  description = "KMS key id/ARN for the safety on-call topic (the 'alerts' CMK). null = unencrypted topic."
  type        = string
  default     = null
}

variable "alarm_emails" {
  description = "Email subscribers of the dedicated safety on-call topic (NEEDS_HUMAN: on-call rota, see README)."
  type        = list(string)
  default     = []
}

variable "alarm_webhook_urls" {
  description = "HTTPS on-call webhook endpoints (pager / WhatsApp bridge) subscribed to the safety on-call topic."
  type        = list(string)
  default     = []
}

variable "general_alerts_topic_arn" {
  description = "Optional general alerts topic ARN; safety alarms also publish there so the platform on-call channel sees them."
  type        = string
  default     = null
}

variable "job_runner_function_name" {
  description = "Scheduled-job runner Lambda to watch for errors (e.g. the geostamp retention purge). null = no alarm."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags merged onto every resource."
  type        = map(string)
  default     = {}
}
