terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.100"
    }
  }
  backend "azurerm" {
    container_name = "tfstate"
    key            = "web.tfstate"
  }
}

provider "azurerm" {
  features {}
}

data "azurerm_subscription" "current" {}
data "azurerm_client_config" "current" {}

variable "location" {
  description = "Where everything is made."
  type        = string
  default     = "westeurope"
}

variable "prefix" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "enable_insights" {
  type    = bool
  default = true
}

locals {
  name = "${var.prefix}-web"
  tags = {
    env  = "prod"
    team = "payments"
  }
}

# Everything for the web app lives here.
resource "azurerm_resource_group" "rg" {
  name     = "${local.name}-rg"
  location = var.location
  tags     = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_account" "main" {
  name                            = "${var.prefix}store"
  resource_group_name             = azurerm_resource_group.rg.name
  location                        = azurerm_resource_group.rg.location
  account_tier                    = "Standard"
  account_replication_type        = "GRS"
  allow_nested_items_to_be_public = true
  min_tls_version                 = "TLS1_2"
}

resource "azurerm_storage_container" "uploads" {
  name                  = "uploads"
  storage_account_name  = azurerm_storage_account.main.name
  container_access_type = "blob"
}

resource "azurerm_service_plan" "plan" {
  name                = "${local.name}-plan"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  os_type             = "Linux"
  sku_name            = "P1v3"
}

resource "azurerm_linux_web_app" "web" {
  name                = local.name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  service_plan_id     = azurerm_service_plan.plan.id
  https_only          = false

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = true
    application_stack {
      node_version = "20-lts"
    }
  }

  app_settings = {
    STORAGE_URL  = azurerm_storage_account.main.primary_blob_endpoint
    DB_PASSWORD  = var.db_password
    API_KEY      = "sk-live-1234567890"
  }
}

resource "azurerm_application_insights" "insights" {
  count               = var.enable_insights ? 1 : 0
  name                = "${local.name}-ai"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  application_type    = "web"
}

resource "azurerm_role_assignment" "web_reads_blobs" {
  scope                = azurerm_storage_account.main.id
  role_definition_name = "Storage Blob Data Reader"
  principal_id         = azurerm_linux_web_app.web.identity[0].principal_id
}

resource "azurerm_role_assignment" "deployer_owner" {
  scope                = data.azurerm_subscription.current.id
  role_definition_name = "Owner"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_network_security_group" "web" {
  name                = "${local.name}-nsg"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  security_rule {
    name                       = "https"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "ssh"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "Internet"
    destination_address_prefix = "*"
  }
}

output "web_url" {
  description = "Where the app answers."
  value       = "https://${azurerm_linux_web_app.web.default_hostname}"
}
