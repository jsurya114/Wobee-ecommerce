# S3 bucket for application media (product images, testimonial photos).
#
# This replaces the current LocalDiskMediaStorage implementation's
# filesystem, behind the application's existing MediaStoragePort interface
# — this module only provisions the bucket; wiring the application's S3
# adapter to it is an application-code change outside this Terraform work.
#
# Fully private: Block Public Access is on across all four settings, ACLs
# are disabled entirely (BucketOwnerEnforced), and access is granted only
# to the EC2 instance role (see the iam module) — never a public bucket
# policy, never static access keys.

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "media" {
  bucket = "${var.name_prefix}-media-${data.aws_caller_identity.current.account_id}"

  tags = merge(var.tags, { Name = "${var.name_prefix}-media" })
}

# Disables ACLs entirely in favor of IAM-only access control — the modern
# recommended default for a new bucket.
resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Versioning guards against an accidental overwrite/delete of a live
# product or testimonial image — cheap at this media volume.
resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Disabled"
  }
}

# No lifecycle configuration: nothing in this bucket has a defined expiry,
# and there's no established access pattern yet to justify tiering to
# Infrequent Access. Revisit once real upload volume exists.
