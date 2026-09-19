variable "name_prefix" {
  type = string
}

variable "ec2_instance_id" {
  type = string
}

variable "rds_instance_id" {
  type = string
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
