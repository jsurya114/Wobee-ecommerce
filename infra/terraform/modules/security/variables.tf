variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "cloudflare_ipv4_cidrs" {
  description = "Cloudflare's published edge IPv4 ranges — the only sources allowed to reach the EC2 origin on 443/80."
  type        = list(string)
}

variable "allow_http_80" {
  description = "Whether to also open port 80 (from Cloudflare only) for an HTTP->HTTPS redirect."
  type        = bool
  default     = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
