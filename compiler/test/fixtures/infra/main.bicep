metadata description = 'A web app with its storage, secrets, and monitoring.'

targetScope = 'resourceGroup'

@description('Where everything is made.')
param location string = resourceGroup().location

@description('A short name used in every resource name.')
@minLength(3)
param prefix string

@secure()
param sqlAdminPassword string

param deployMonitoring bool = true

param containerNames array = [
  'uploads'
  'exports'
]

var storageName = '${prefix}${uniqueString(resourceGroup().id)}'
var blobReader = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1')

// Files the app uploads.
resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: true
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
  }

  resource blobs 'blobServices' = {
    name: 'default'
  }
}

resource containers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = [for c in containerNames: {
  parent: storage::blobs
  name: c
  properties: {
    publicAccess: 'None'
  }
}]

resource plan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${prefix}-plan'
  location: location
  sku: {
    name: 'P1v3'
  }
  properties: {
    reserved: true
  }
}

resource web 'Microsoft.Web/sites@2023-01-01' = {
  name: '${prefix}-web'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      appSettings: [
        {
          name: 'STORAGE_URL'
          value: storage.properties.primaryEndpoints.blob
        }
      ]
    }
  }
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: '${prefix}-kv'
}

resource sqlServer 'Microsoft.Sql/servers@2023-05-01-preview' = {
  name: '${prefix}-sql'
  location: location
  properties: {
    administratorLogin: 'sqladmin'
    administratorLoginPassword: sqlAdminPassword
  }
}

resource webReadsBlobs 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, web.id, blobReader)
  scope: storage
  properties: {
    principalId: web.identity.principalId
    roleDefinitionId: blobReader
    principalType: 'ServicePrincipal'
  }
}

resource webOwnsGroup 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, web.id, 'owner')
  properties: {
    principalId: web.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8e3af657-a8ff-443c-a75c-2fe8c4bcb635')
  }
}

resource nsg 'Microsoft.Network/networkSecurityGroups@2023-04-01' = {
  name: '${prefix}-nsg'
  location: location
  properties: {
    securityRules: [
      {
        name: 'rdp'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '3389'
        }
      }
    ]
  }
}

module monitoring './monitoring.bicep' = if (deployMonitoring) {
  name: 'monitoring'
  params: {
    location: location
    appName: web.name
  }
}

output webUrl string = 'https://${web.properties.defaultHostName}'
output storageId string = storage.id
