variable "aws_region" {
  description = "AWS region for all Woobe production infrastructure."
  type        = string
  default     = "ap-south-2"
}

variable "aws_profile" {
  description = "Named AWS CLI/SSO profile to use for plan/apply. Leave empty to use the default credential chain (e.g. in CI)."
  type        = string
  default     = ""
}

variable "project" {
  type    = string
  default = "Woobe"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnets, one per AZ. Only the first is used by EC2 in Phase 1; the second exists so a Phase 2 ALB can span 2 AZs without a networking rewrite."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Private/isolated subnets for RDS. RDS DB subnet groups require 2+ AZs even for a Single-AZ instance."
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "cloudflare_ipv4_cidrs" {
  description = "Cloudflare's published IPv4 edge ranges. The EC2 security group accepts inbound HTTPS only from these. Verify against https://www.cloudflare.com/ips-v4 before first apply — Cloudflare updates this list periodically."
  type        = list(string)
  default = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
    "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
    "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"
  ]
}

variable "allow_http_80" {
  description = "Open port 80 (from Cloudflare only) for an HTTP->HTTPS redirect. Off by default — Cloudflare Full (strict) mode only requires 443 on the origin."
  type        = bool
  default     = false
}

variable "ec2_instance_type" {
  type    = string
  default = "t4g.small"
}

variable "ec2_root_volume_size_gb" {
  type    = number
  default = 30
}

variable "compose_version" {
  description = "Docker Compose CLI plugin release installed on the EC2 instance."
  type        = string
  default     = "v2.29.7"
}

variable "valkey_maxmemory_mb" {
  description = "Valkey maxmemory cap, in MB, on the 2 GiB t4g.small — leaves headroom for the API and Worker containers once they're deployed."
  type        = number
  default     = 256
}

variable "db_instance_class" {
  description = "Smallest practical Graviton-compatible RDS class for Phase 1; revisit after load testing."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage_gb" {
  type    = number
  default = 20
}

variable "db_backup_retention_days" {
  type    = number
  default = 7
}

variable "db_deletion_protection" {
  type    = bool
  default = true
}

variable "db_skip_final_snapshot" {
  type    = bool
  default = false
}

variable "db_username" {
  type    = string
  default = "woobe_admin"
}

variable "db_name" {
  type    = string
  default = "woobe"
}

variable "alert_email" {
  description = "Optional email address for CloudWatch alarm notifications. Leave empty to create the SNS topic without a subscriber."
  type        = string
  default     = ""
}
