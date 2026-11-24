provider "aws" {
  region = "us-east-1"
}

variable "bucket_names" {
  type    = set(string)
  default = ["logs", "assets"]
}

variable "admin_password" {
  type    = string
  default = "hunter2-change-me"
}

resource "aws_s3_bucket" "site" {
  for_each = var.bucket_names
  bucket   = "acme-${each.key}"
}

resource "aws_s3_bucket_public_access_block" "site" {
  for_each            = aws_s3_bucket.site
  bucket              = each.value.id
  block_public_acls   = false
  block_public_policy = true
}

resource "aws_security_group" "web" {
  name   = "web"
  vpc_id = data.aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

data "aws_vpc" "main" {
  default = true
}

resource "aws_db_instance" "orders" {
  identifier             = "orders"
  engine                 = "postgres"
  instance_class         = "db.t3.micro"
  username               = "app"
  password               = var.admin_password
  storage_encrypted      = false
  vpc_security_group_ids = [aws_security_group.web.id]
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker" {
  name               = "worker"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy" "worker" {
  role = aws_iam_role.worker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "arn:aws:s3:::acme-assets/*"
      },
      {
        Effect   = "Allow"
        Action   = "*"
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "admin" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

resource "google_project_iam_member" "ci" {
  project = "acme-prod"
  role    = "roles/editor"
  member  = "serviceAccount:ci@acme-prod.iam.gserviceaccount.com"
}
