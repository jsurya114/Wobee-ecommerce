variable "name" {
  description = "ECR repository name."
  type        = string
}

variable "image_retention_count" {
  description = "How many of the most recent images to keep. Older images are expired, so this is also the manual-rollback window."
  type        = number
  default     = 20
}

variable "tags" {
  type    = map(string)
  default = {}
}
