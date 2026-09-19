# Public delivery layer for media: Browser -> CloudFront -> PRIVATE S3 bucket.
#
# The bucket stays fully private (Block Public Access on, ACLs disabled). The
# only thing allowed to read objects is THIS distribution, through Origin
# Access Control (OAC) — the current mechanism; legacy Origin Access Identity
# (OAI) is deliberately not used. Browsers never receive a bucket URL, an AWS
# credential, or a presigned URL: public product images are just cacheable
# HTTPS URLs on the distribution's domain.
#
# The API (not the browser) writes and deletes objects, using the EC2 instance
# role — see the iam module.

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized" # honors the origin's Cache-Control up to 1 year, gzip/brotli on
}

data "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "Managed-SecurityHeadersPolicy" # nosniff, HSTS, referrer policy, etc.
}

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${var.name_prefix}-media-oac"
  description                       = "OAC for the ${var.name_prefix} private media bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "media" {
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  comment         = "${var.name_prefix} public media (private S3 origin via OAC)"
  price_class     = var.price_class

  origin {
    domain_name              = var.bucket_regional_domain_name
    origin_id                = "s3-media"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-media"
    viewer_protocol_policy = "redirect-to-https"

    # Read-only: images are only ever fetched. Uploads go browser -> API -> S3.
    allowed_methods = ["GET", "HEAD"]
    cached_methods  = ["GET", "HEAD"]
    compress        = true

    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
  }

  # The bucket grants CloudFront GetObject but deliberately NOT ListBucket
  # (that would let anyone list the bucket by requesting "/"), so S3 answers
  # 403 for a key that does not exist. Present that as the 404 it really is,
  # and only cache it briefly so a just-uploaded key is not stuck as "missing".
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = ""
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # The default *.cloudfront.net certificate — HTTPS with no ACM/DNS work. A
  # custom media domain (ACM cert in us-east-1 + alias) is a later change; the
  # API only needs MEDIA_PUBLIC_BASE_URL updated when that happens.
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-media-cdn" })
}

# Only THIS distribution may read objects. The service principal + SourceArn
# condition is what makes this policy non-public (it passes Block Public
# Access) — no other CloudFront distribution and no anonymous request matches.
resource "aws_s3_bucket_policy" "media" {
  bucket = var.bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowReadFromThisCloudFrontDistributionOnly"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${var.bucket_arn}/*"
      Condition = {
        StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.media.arn }
      }
    }]
  })
}
