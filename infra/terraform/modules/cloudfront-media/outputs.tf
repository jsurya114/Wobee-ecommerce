output "distribution_id" {
  value = aws_cloudfront_distribution.media.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.media.arn
}

output "domain_name" {
  value = aws_cloudfront_distribution.media.domain_name
}

output "public_base_url" {
  description = "HTTPS origin browsers load media from; set as the API's MEDIA_PUBLIC_BASE_URL."
  value       = "https://${aws_cloudfront_distribution.media.domain_name}"
}
