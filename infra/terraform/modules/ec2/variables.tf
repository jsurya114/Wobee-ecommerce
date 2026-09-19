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

variable "tags" {
  type    = map(string)
  default = {}
}
