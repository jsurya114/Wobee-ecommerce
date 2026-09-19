variable "name_prefix" {
  type = string
}

variable "enable_versioning" {
  description = "Protects against accidental overwrite/delete of product/testimonial images."
  type        = bool
  default     = true
}

variable "tags" {
  type    = map(string)
  default = {}
}
