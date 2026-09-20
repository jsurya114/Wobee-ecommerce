# ============================================================================
# REMOTE STATE BACKEND — ACTIVE (activated 2026-09-20)
# ============================================================================
# The state bucket (woobe-terraform-state-185658217213, ap-south-2) was
# bootstrapped by hand per the commands preserved below, then this file was
# renamed from backend.tf.example to backend.tf and `terraform init` was
# run. No local state file ever existed to migrate (no apply had run
# against this account before this point) — Terraform created a fresh,
# empty state directly in S3.
#
# Why remote state at all: production Terraform state currently lives only
# on whichever developer's laptop last ran a command. That's a single point
# of failure (disk loss = state loss = Terraform can no longer safely
# reconcile real infrastructure) and makes concurrent operations from two
# machines unsafe (no shared lock).
#
# Why S3 + native locking, not S3 + DynamoDB: Terraform >= 1.10 supports
# `use_lockfile = true`, which uses a lightweight lock object inside the
# same S3 bucket (via S3's conditional-write support) instead of a separate
# DynamoDB table. This repo is on Terraform 1.16.3, so the DynamoDB-table
# pattern from older Terraform guides is unnecessary here — one bucket is
# the entire backend, with no second AWS service, no second bill line, and
# no second resource to secure.
#
# Cost: negligible. The state file itself is a few KB of JSON; S3 Standard
# storage at that size rounds to $0.00/month. Each plan/apply does a small
# handful of GET/PUT requests — at S3's per-request pricing that's well
# under a cent a month even with frequent applies. There is no DynamoDB
# table, so there is no second per-request/read-write-capacity cost either.
# Expect this backend to add effectively $0.00–0.01/month to the AWS bill.
#
# Security: bucket versioning is enabled (a corrupted/overwritten state
# object is recoverable from a prior version), SSE-S3 encryption is the
# default for every object, all four S3 Block Public Access settings are
# on, and the bucket policy (created in Step 1 below) denies any request
# that doesn't use TLS. Access is restricted to whichever IAM
# principal/profile you bootstrap it with — the same credential chain
# Terraform already uses for the `aws` provider (var.aws_profile), not a
# new credential.
#
# No secrets live in this file or in backend config: only a bucket name,
# object key, region, and two booleans. Terraform resolves AWS credentials
# for the backend exactly the way it resolves them for the provider block —
# environment variables, an AWS profile, or (in CI) OIDC/instance-role
# credentials — never a hardcoded key here.
#
# ----------------------------------------------------------------------------
# Bootstrap record — the state bucket was created with these calls
# (run once, by hand, outside Terraform: the config that stores its state
# in this bucket can't be the thing that created the bucket)
# ----------------------------------------------------------------------------
#
#   aws s3api create-bucket \
#     --bucket woobe-terraform-state-185658217213 \
#     --region ap-south-2 \
#     --create-bucket-configuration LocationConstraint=ap-south-2 \
#     --profile WoobeTerraformAdmin-185658217213
#
#   aws s3api put-bucket-ownership-controls \
#     --bucket woobe-terraform-state-185658217213 \
#     --ownership-controls '{"Rules":[{"ObjectOwnership":"BucketOwnerEnforced"}]}' \
#     --profile WoobeTerraformAdmin-185658217213
#
#   aws s3api put-public-access-block \
#     --bucket woobe-terraform-state-185658217213 \
#     --public-access-block-configuration \
#       BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
#     --profile WoobeTerraformAdmin-185658217213
#
#   aws s3api put-bucket-versioning \
#     --bucket woobe-terraform-state-185658217213 \
#     --versioning-configuration Status=Enabled \
#     --profile WoobeTerraformAdmin-185658217213
#
#   aws s3api put-bucket-encryption \
#     --bucket woobe-terraform-state-185658217213 \
#     --server-side-encryption-configuration \
#       '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}' \
#     --profile WoobeTerraformAdmin-185658217213
#
#   aws s3api put-bucket-policy \
#     --bucket woobe-terraform-state-185658217213 \
#     --policy file://bootstrap-state-bucket-policy.json.example \
#     --profile WoobeTerraformAdmin-185658217213
#     # (denies any request that doesn't use TLS)
#
#   aws s3api put-bucket-tagging \
#     --bucket woobe-terraform-state-185658217213 \
#     --tagging '{"TagSet":[{"Key":"Project","Value":"Woobe"},{"Key":"Purpose","Value":"terraform-state"},{"Key":"ManagedBy","Value":"manual-bootstrap"}]}' \
#     --profile WoobeTerraformAdmin-185658217213
#
# ----------------------------------------------------------------------------
# Locking mechanics (native S3 locking, use_lockfile = true)
# ----------------------------------------------------------------------------
# Before writing state, Terraform attempts to create a `<key>.tflock`
# object in the bucket using an S3 conditional write (If-None-Match) that
# only succeeds if no lock object currently exists. A second concurrent
# `terraform plan`/`apply` sees the lock object already exists, fails the
# conditional write, and Terraform reports "Error acquiring the state
# lock" instead of proceeding — exactly the same safety guarantee the
# classic DynamoDB-table pattern provides, just without a second AWS
# resource. The lock object is removed automatically when the operation
# finishes (including on most failure paths); a stuck lock from a killed
# process can be cleared with `terraform force-unlock <lock-id>`.
# ============================================================================

terraform {
  backend "s3" {
    bucket       = "woobe-terraform-state-185658217213"
    key          = "production/terraform.tfstate"
    region       = "ap-south-2"
    profile      = "WoobeTerraformAdmin-185658217213" # same profile terraform.tfvars uses for the provider — not a credential, just a named local reference
    encrypt      = true
    use_lockfile = true
  }
}
