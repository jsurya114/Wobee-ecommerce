variable "name_prefix" {
  type = string
}

variable "ec2_instance_id" {
  type = string
}

variable "rds_instance_id" {
  type = string
}

variable "valkey_maxmemory_mb" {
  description = "Must match the ec2 module's Valkey maxmemory (MB) — used only to compute the memory-pressure alarm threshold (80% of this value)."
  type        = number
}

variable "alert_email" {
  description = "Optional email address to subscribe to the alarm SNS topic. Empty string skips the subscription."
  type        = string
  default     = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
