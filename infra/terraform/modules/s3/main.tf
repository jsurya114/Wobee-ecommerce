# Private S3 bucket for application media (product images, testimonial photos).
#
# The API writes and deletes objects here through its S3MediaStorage adapter
# (MediaStoragePort), using the EC2 instance role — never access keys.
# Browsers never touch this bucket: they read media through the CloudFront
# distribution in the cloudfront-media module, which is the ONLY reader (via
# Origin Access Control and a bucket policy scoped to that one distribution).
#
# Fully private: Block Public Access is on across all four settings, ACLs are
# disabled entirely (BucketOwnerEnforced), and no public bucket policy exists.

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

# Housekeeping for a versioned bucket. Versioning keeps an accidentally
# deleted/overwritten image recoverable; without a lifecycle rule every delete
# would keep its old version (and cost) forever. Current objects never expire —
# only superseded versions, orphaned delete markers and abandoned multipart
# uploads are cleaned up.
resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  # Lifecycle rules on a versioned bucket must be created after versioning.
  depends_on = [aws_s3_bucket_versioning.media]

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_retention_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "remove-expired-delete-markers"
    status = "Enabled"
    filter {}

    expiration {
      expired_object_delete_marker = true
    }
  }
}
