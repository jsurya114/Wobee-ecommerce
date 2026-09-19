variable "name_prefix" {
  type = string
}

variable "public_subnet_id" {
  type = string
}

variable "ec2_sg_id" {
  type = string
}

variable "iam_instance_profile_name" {
  type = string
}

variable "instance_type" {
  type    = string
  default = "t4g.small"
}

variable "root_volume_size_gb" {
  type    = number
  default = 30
}

variable "valkey_param_name" {
  description = "SSM parameter name (not the value) the boot script reads the Valkey password from."
  type        = string
}

variable "valkey_maxmemory_mb" {
  type    = number
  default = 256
}

variable "compose_version" {
  type    = string
  default = "v2.29.7"
}

variable "aws_region" {
  type = string
}

variable "api_domain" {
  description = "Public hostname the API is served on, through Cloudflare. nginx answers only for this name."
  type        = string
  default     = "api.woobe.in"
}

variable "api_port" {
  description = "Port the API container listens on (host networking). Must equal API_PORT in /opt/woobe/app/api.env (default 4000). Never opened in the security group."
  type        = number
  default     = 4000
}

variable "cloudflare_ipv4_cidrs" {
  description = "Cloudflare's IPv4 edge ranges — the only peers whose CF-Connecting-IP nginx trusts as the client address. Pass the same list the security group uses."
  type        = list(string)
}

variable "nginx_image" {
  description = "nginx image, pinned by digest (nginx:1.28-alpine index, multi-arch incl. linux/arm64, resolved 2026-09-20). Bump deliberately; base-image security fixes do not arrive with a digest pin."
  type        = string
  default     = "nginx@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236"
}

variable "tags" {
  type    = map(string)
  default = {}
}
