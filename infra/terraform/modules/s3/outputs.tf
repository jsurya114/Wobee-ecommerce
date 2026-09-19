output "bucket_id" {
  value = aws_s3_bucket.media.id
}

output "bucket_arn" {
  value = aws_s3_bucket.media.arn
}

output "bucket_regional_domain_name" {
  value = aws_s3_bucket.media.bucket_regional_domain_name
}
