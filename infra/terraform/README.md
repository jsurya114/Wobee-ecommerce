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
    iam/             Least-privilege EC2 instance role (incl. ECR pull)
    monitoring/      CloudWatch alarms + SNS topic
    ecr/             Private, immutable-tag ECR repo for the API image
    github-oidc/     GitHub OIDC provider + role pinned to repo:jsurya114/Wobee-ecommerce:ref:refs/heads/main
    ssm-deploy/      SSM Run Command document (deploy.sh) that GitHub Actions triggers
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

## CI/CD

`.github/workflows/deploy.yml` builds `apps/api/Dockerfile`, pushes it to ECR
and runs the `ssm-deploy` document on the instance by image digest,
authenticating to AWS via GitHub OIDC only (no stored keys). It is a safe
single-instance in-place deploy with health verification and automatic
rollback — not zero-downtime. Full flow, first-time setup, rollback and
troubleshooting: [`docs/deployment.md`](../../docs/deployment.md). The
`ecr`, `ssm_deploy` and `github_oidc` modules do not depend on EC2/RDS, so
they can be applied first with `terraform apply -target=module.github_oidc`.

## What's deliberately not deployed yet

The API and Worker containers are started by the deploy pipeline, not by this
configuration (`user_data` only installs Docker/Compose and starts Valkey).
Media is served from a private S3 bucket through CloudFront (`s3` and
`cloudfront-media` modules; the API's `S3MediaStorage` adapter is built).
The HTTPS edge (nginx container, Cloudflare Origin CA certificate placed by
hand, Cloudflare proxied DNS) is prepared in `user_data` but not live — see
`docs/deployment.md` → "HTTPS edge". Still not built: secret injection beyond
a hand-created `/opt/woobe/app/api.env`.

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
