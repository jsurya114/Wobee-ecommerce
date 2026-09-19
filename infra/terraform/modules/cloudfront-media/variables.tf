variable "name_prefix" {
  type = string
}

variable "bucket_id" {
  description = "Name of the private media bucket (the module's bucket policy is attached to it)."
  type        = string
}

variable "bucket_arn" {
  type = string
}

variable "bucket_regional_domain_name" {
  description = "Regional S3 domain name used as the origin (never the public website endpoint)."
  type        = string
}

variable "price_class" {
  description = "PriceClass_200 includes India edge locations; PriceClass_100 does not."
  type        = string
  default     = "PriceClass_200"
}

variable "tags" {
  type    = map(string)
  default = {}
}
