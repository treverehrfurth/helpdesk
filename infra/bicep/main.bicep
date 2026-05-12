param environmentName string = 'dev'
param location string = resourceGroup().location
param staticWebAppName string = 'it-helpdesk-${environmentName}-web'
param functionAppName string = 'it-helpdesk-${environmentName}-api'
param postgresServerName string = 'it-helpdesk-${environmentName}-pg'
param postgresDatabaseName string = 'ithelpdesk'
param repositoryUrl string = ''
param branch string = 'main'
@secure()
param postgresAdminLogin string
@secure()
param postgresAdminPassword string
@secure()
param databaseUrl string = ''

module appInsights './app-insights.bicep' = {
  name: 'appInsights'
  params: {
    name: 'it-helpdesk-${environmentName}-appi'
    location: location
  }
}

module staticWebApp './static-web-app.bicep' = {
  name: 'staticWebApp'
  params: {
    name: staticWebAppName
    location: location
    repositoryUrl: repositoryUrl
    branch: branch
  }
}

module postgres './postgres.bicep' = {
  name: 'postgres'
  params: {
    serverName: postgresServerName
    databaseName: postgresDatabaseName
    location: location
    administratorLogin: postgresAdminLogin
    administratorPassword: postgresAdminPassword
  }
}

module functionApp './function-app.bicep' = {
  name: 'functionApp'
  params: {
    name: functionAppName
    location: location
    appInsightsConnectionString: appInsights.outputs.connectionString
    databaseUrl: databaseUrl
  }
}

output staticWebAppHostname string = staticWebApp.outputs.defaultHostname
output functionAppHostname string = functionApp.outputs.defaultHostname
output postgresFqdn string = postgres.outputs.fullyQualifiedDomainName
