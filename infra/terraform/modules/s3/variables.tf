variable "name_prefix" {
  type = string
}

variable "enable_versioning" {
  description = "Protects against accidental overwrite/delete of product/testimonial images."
  type        = bool
  default     = true
}

variable "noncurrent_version_retention_days" {
  description = "How long a superseded/deleted version stays recoverable before it is permanently removed."
  type        = number
  default     = 30
}

variable "tags" {
  type    = map(string)
  default = {}
}
