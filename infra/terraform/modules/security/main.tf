# Security groups. Two, least-privilege, referencing each other by ID
# rather than by broad CIDR wherever possible.
#
# EC2: inbound HTTPS only from Cloudflare's published edge ranges — no
# public SSH (no port 22 rule exists at all; access is via SSM Session
# Manager, which needs no inbound rule). Outbound is open, since the API
# and worker need to reach Razorpay, Google OAuth, SMTP, SSM endpoints,
# ECR, and S3.
#
# RDS: inbound PostgreSQL only from the EC2 security group — never a CIDR,
# never 0.0.0.0/0. Not publicly reachable under any circumstance.

resource "aws_security_group" "ec2" {
  name        = "${var.name_prefix}-ec2-sg"
  description = "Woobe backend EC2 — HTTPS from Cloudflare only, no public SSH"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, { Name = "${var.name_prefix}-ec2-sg" })
}

resource "aws_vpc_security_group_ingress_rule" "ec2_https_from_cloudflare" {
  for_each = toset(var.cloudflare_ipv4_cidrs)

  security_group_id = aws_security_group.ec2.id
  cidr_ipv4         = each.value
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  description       = "HTTPS from Cloudflare edge"
}

resource "aws_vpc_security_group_ingress_rule" "ec2_http_from_cloudflare" {
  for_each = var.allow_http_80 ? toset(var.cloudflare_ipv4_cidrs) : []

  security_group_id = aws_security_group.ec2.id
  cidr_ipv4         = each.value
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
  description       = "HTTP from Cloudflare edge (redirect-to-HTTPS only)"
}

# Deliberately no ingress rule for port 22 (SSH) or port 6379 (Valkey)
# anywhere in this security group — SSH is replaced by SSM Session
# Manager, and Valkey is bound to the loopback interface only and never
# reachable via the ENI regardless of security group rules.

resource "aws_vpc_security_group_egress_rule" "ec2_all_outbound" {
  security_group_id = aws_security_group.ec2.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Outbound: Razorpay, Google OAuth, SMTP, SSM, ECR, S3, package repos"
}

resource "aws_security_group" "rds" {
  name        = "${var.name_prefix}-rds-sg"
  description = "Woobe RDS PostgreSQL — inbound only from the EC2 security group, never public"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, { Name = "${var.name_prefix}-rds-sg" })
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_ec2" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.ec2.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "PostgreSQL from the Woobe EC2 security group only"
}

resource "aws_vpc_security_group_egress_rule" "rds_all_outbound" {
  security_group_id = aws_security_group.rds.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Default egress — RDS does not initiate application-level outbound traffic"
}
