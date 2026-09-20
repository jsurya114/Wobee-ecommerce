variable "name_prefix" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "instance_id" {
  description = "EC2 instance the observability stack is installed on (targeted by instance ID)."
  type        = string
}

variable "ec2_role_name" {
  description = "Name of the EC2 instance role. It gets Get/Put on the single Grafana password parameter, nothing broader."
  type        = string
}

variable "config_dir" {
  description = "Path to infra/observability (the version-controlled Prometheus/Grafana/compose config)."
  type        = string
}

variable "api_port" {
  description = "Port the API listens on (loopback). Must equal API_PORT in /opt/woobe/app/api.env."
  type        = number
}

variable "worker_metrics_port" {
  description = "Port the notification worker's metrics server listens on (loopback). Must equal WORKER_METRICS_PORT in /opt/woobe/app/api.env."
  type        = number
  default     = 9102

  validation {
    condition     = var.worker_metrics_port >= 1024 && var.worker_metrics_port <= 65535 && !contains([3000, 4000, 6379, 9090, 9100], var.worker_metrics_port)
    error_message = "worker_metrics_port must be an unprivileged port that does not collide with Grafana (3000), the API default (4000), Valkey (6379), Prometheus (9090) or Node Exporter (9100)."
  }
}

variable "sync_schedule" {
  description = "How often State Manager re-converges the host (drift correction). A change to the config runs it immediately regardless."
  type        = string
  default     = "rate(12 hours)"
}

variable "tags" {
  type    = map(string)
  default = {}
}
