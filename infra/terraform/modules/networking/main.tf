# Networking — VPC, public subnet(s) for the EC2 origin, private/isolated
# subnet(s) for RDS, an Internet Gateway, and route tables.
#
# No NAT Gateway: nothing in a private subnet needs outbound internet
# access in Phase 1 (RDS doesn't call out; Valkey is self-hosted on the
# EC2 instance, which lives in the public subnet and reaches the internet
# directly via the IGW for Razorpay/Google OAuth/SMTP).
#
# Two public subnets (in two AZs) are provisioned even though Phase 1 only
# launches one EC2 instance into the first — this costs nothing (subnets
# are free) and means a Phase 2 ALB can span multiple AZs without any
# networking rewrite.

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-vpc"
  })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-igw"
  })
}

resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = false # EC2 gets a stable address via a dedicated Elastic IP, not an ephemeral auto-assigned public IP

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-public-${data.aws_availability_zones.available.names[count.index]}"
    Tier = "public"
  })
}

# RDS DB subnet groups require coverage across 2+ AZs even for a Single-AZ
# instance, so two private subnets are provisioned though only one AZ
# actually hosts the database today.
resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-private-${data.aws_availability_zones.available.names[count.index]}"
    Tier = "private"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private route table carries no internet route (no NAT Gateway) — only
# the VPC's implicit local route, since RDS has no outbound internet
# requirement.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-private-rt"
  })
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
