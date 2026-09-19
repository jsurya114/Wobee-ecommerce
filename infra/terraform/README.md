# Woobe Infrastructure — Terraform

Phase 1 production infrastructure for the Woobe backend: EC2 + Docker,
self-hosted Valkey, RDS PostgreSQL, and S3 for media. No ALB, no NAT
Gateway, no managed Redis/Valkey, no Kubernetes, no Auto Scaling Group —
see the full report delivered alongside this code for the reasoning and
the Phase 2 migration path.

Frontend apps (`apps/web`, `apps/admin`) are hosted on Vercel and are
outside this Terraform configuration.

## Structure

```
infra/terraform/
  modules/
    networking/    VPC, subnets, IGW, route tables
    security/       EC2 + RDS security groups
    ec2/            Backend EC2 instance, EIP, user_data bootstrap
    rds/            PostgreSQL 16, Single-AZ, AWS-managed master password
    s3/              Private media bucket
    iam/             Least-privilege EC2 instance role
    monitoring/      CloudWatch alarms + SNS topic
  environments/
    production/      Root module wiring everything together
```

## Prerequisites

- Terraform >= 1.7
- AWS CLI v2, authenticated against the `WoobeTerraformAdmin` SSO profile:

  ```
  aws sso login --profile WoobeTerraformAdmin-185658217213
  ```

## Running

```bash
cd infra/terraform/environments/production
cp terraform.tfvars.example terraform.tfvars   # adjust as needed; never commit this file
terraform init
terraform fmt -recursive ..
terraform validate
terraform plan -out=tfplan
```

Review the plan carefully — in particular, confirm no resource creates a
public ingress path to RDS or Valkey, and that no `Auto Scaling Group`,
`Load Balancer`, or `NAT Gateway` resource appears. **Do not run
`terraform apply` without an explicit go-ahead.**

## What's deliberately not deployed yet

Docker and the Compose plugin are installed on the EC2 instance, and a
self-hosted Valkey container is started, but the Woobe API and Worker
containers are **not** started by this configuration. No production
Dockerfile exists in the repository yet — building one, plus the actual
container deployment (compose file wiring API + Worker + Nginx/Caddy +
Valkey, TLS via a Cloudflare Origin CA certificate, and secret injection
for JWT/Razorpay/SMTP credentials) is a separate, later piece of work.

## Phase 2 (not built yet)

```
Cloudflare -> ALB -> ASG (2+ EC2) -> managed Valkey (ElastiCache) -> RDS -> S3
```

Adding this later means: a new `alb` module (ALB, target group, listener,
ACM cert) sitting in front of the existing public subnets; converting the
standalone `aws_instance` into a launch-template-backed Auto Scaling
Group; and a new `elasticache` module replacing the self-hosted Valkey
container, with the application's Redis client URL simply repointed. None
of today's modules need to be rewritten for this — see the delivered
report for the detailed migration path.
