output "instance_id" {
  value = aws_instance.backend.id
}

output "private_ip" {
  value = aws_instance.backend.private_ip
}

output "public_ip" {
  description = "The Elastic IP — this is the stable address to point Cloudflare's DNS record at."
  value       = aws_eip.backend.public_ip
}
