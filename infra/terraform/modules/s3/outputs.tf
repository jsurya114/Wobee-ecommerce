output "bucket_id" {
  value = aws_s3_bucket.media.id

  # Anything that attaches a bucket policy (the CloudFront module) must wait
  # for Block Public Access to be in place first.
  depends_on = [aws_s3_bucket_public_access_block.media]
}

output "bucket_arn" {
  value = aws_s3_bucket.media.arn
}

output "bucket_regional_domain_name" {
  value = aws_s3_bucket.media.bucket_regional_domain_name
}
