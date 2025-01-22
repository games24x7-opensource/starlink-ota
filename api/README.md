# CodePush Server

The CodePush Server is a Node.js application that powers the CodePush Service. It allows users to deploy and manage over-the-air updates for their react-native applications in a self-hosted environment.

Please refer to [react-native-code-push](https://github.com/microsoft/react-native-code-push) for instructions on how to onboard your application to CodePush.

## Deployment

### Local

#### Prerequisites
- There is a `docker-compose.yml` file at root to run **Dynamo,Redis,S3** services locally
- Run `docker-compose up -d` to start the services



#### Steps
To run the CodePush Server locally, follow these steps:
1. Clone the CodePush Service repository.
1. Create a `.env` file and configure the mandatory variables as outlined in the `ENVIRONMENT.md` file.
1. Install dependencies by running `npm install`.
1. Build the server by running `npm run build`.
1. Start the server by running `npm run start:env`.

By default, local CodePush server runs on HTTP. To run CodePush Server on HTTPS:

1. Create a `certs` directory and place `cert.key` (private key) and `cert.crt` (certificate) files there.
2. Set environment variable [HTTPS](./ENVIRONMENT.md#https) to true.
 

For more detailed instructions and configuration options, please refer to the [ENVIRONMENT.md](./ENVIRONMENT.md) file.

### Azure

CodePush Server is designed to run as [Azure App Service](https://learn.microsoft.com/en-us/azure/app-service/overview).

#### Prerequisites

To deploy CodePush to Azure, an active Azure account and subscription are needed. 
For more information, follow Azure's [official documentation](https://azure.microsoft.com/en-us/get-started/).
During the deployment process, the included bicep script will create bare minimum Azure services needed to run CodePush Server including:
1. Service plan
2. App Service
3. Storage account

Additionally, for user authentication, a GitHub or Microsoft OAuth application is needed. 
More detailed instructions on how to set up one can be found in the section [OAuth Apps](#oauth-apps).

#### Steps

**NOTE** Please be aware of [project-suffix naming limitations](#project-suffix) for resources in Azure .

1. Login to your Azure account: `az login`
2. Select subscription for deployment: `az account set --subscription <subscription-id>`
3. Create resource group for CodePush resources: `az group create --name <resource-group-name> --location <az-location eg. eastus>`
4. Deploy infrastructure with the next command: `az deployment group create --resource-group <resource-group-name> --template-file ./codepush-infrastructure.bicep --parameters project_suffix=<project-suffix> az_location=<az-location eg. eastus> github_client_id=<github-client-id> github_client_secret=<github-client-secret> microsoft_client_id=<microsoft-client-id> microsoft_client_secret=<microsoft-client-secret>`. OAuth parameters (both GitHub and Microsoft) are optional. It is possible to specify them after the deployment in environment settings of Azure WebApp.
5. Deploy CodePush to the Azure WebApp created during infrastructure deployment. Follow the Azure WebApp [official documentation](https://learn.microsoft.com/en-us/azure/app-service/) "Deployment and configuration" section for detailed instructions.

> **Warning!** The created Azure Blob Storage has default access settings. 
> This means that all users within the subscription can access the storage account tables. 
> Adjusting the storage account access settings to ensure proper security is the responsibility of the owner.

## Configure react-native-code-push

In order for [react-native-code-push](https://github.com/microsoft/react-native-code-push) to use your server, additional configuration value is needed.

### Android

in `strings.xml`, add following line, replacing `server-url` with your server.

```
<string moduleConfig="true" name="CodePushServerUrl">server-url</string>
```

### iOS

in `Info.plist` file, add following lines, replacing `server-url` with your server.

```
<key>CodePushServerURL</key>
<string>server-url</string>
```

## OAuth apps

CodePush uses GitHub and Microsoft as identity providers, so for authentication purposes, you need to have an OAuth App registration for CodePush. 
Client id and client secret created during registration should be provided to the CodePush server in environment variables. 
Below are instructions on how to create OAuth App registrations.

### GitHub

1. Go to https://github.com/settings/developers
1. Click on `New OAuth App`
1. `Homepage URL` parameter will be the same as URL of your CodePush application on Azure - `https://codepush-<project-suffix>.azurewebsites.net` (for local development it will be either http://localhost:3000 or https://localhost:8443)
1. `Authorization callback URL` will be `https://codepush-<project-suffix>.azurewebsites.net/auth/callback/github` (for local development it will be either http://localhost:3000/auth/callback/github or https://localhost:8443/auth/callback/github)

### Microsoft

Both work and personal accounts use the same application for authentication. The only difference is property `Supported account types` that is set when creating the app.

1. Register an Azure Registered Application following [official guideline](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app#register-an-application)
1. For option `Supported account types`:
   1. If you want to support both Personal and Work accounts, select `Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)`
   1. If you want to only support Work accounts, choose either `Accounts in this organizational directory only (<your directory> - Single tenant)` or `Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)` depending if you want to support Single or Multitenant authorization. Make sure to set `MICROSOFT_TENANT_ID` envrionment variable in case of using single tenant application.
   1. If you want to only support Personal accounts, select `Personal Microsoft accounts only`
1. Set up Redirect URI(s) depending on the choice you made for `Supported account types`. If you choose both Personal and Work accounts, you need to add both redirect URIs, otherwise just one of the ones:
   1. Personal account: `https://codepush-<project-suffix>.azurewebsites.net/auth/callback/microsoft` (for local development it will be either http://localhost:3000/auth/callback/microsoft or https://localhost:8443/auth/callback/microsoft)
   1. Work account: `https://codepush-<project-suffix>.azurewebsites.net/auth/callback/azure-ad` (for local development it will be http://localhost:3000/auth/callback/azure-ad or https://localhost:8443/auth/callback/azure-ad)
1. Generate secret following this [official guideline](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app#add-credentials)

## Naming limitations

### project-suffix

1. Only letters are allowed.
1. Maximum 15 characters.

## Metrics

Installation metrics allow monitoring release activity via the CLI. For detailed usage instructions, please refer to the [CLI documentation](../cli/README.md#development-parameter).

Redis is required for Metrics to work.

### Steps

1. Install Redis by following [official installation guide](https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/).
1. TLS is required. Follow [official Redis TLS run guide](https://redis.io/docs/latest/operate/oss_and_stack/management/security/encryption/#running-manually).
1. Set the necessary environment variables for [Redis](./ENVIRONMENT.md#redis).

----

# CodePush Server: Continuous Deployment for Mobile Apps

CodePush Server is a backend service that enables over-the-air updates for mobile applications, allowing developers to push updates directly to users' devices without going through app store review processes.

## Project Description

CodePush Server provides a robust infrastructure for managing and deploying mobile app updates. It offers a RESTful API for client SDKs to interact with, handling authentication, app management, and update distribution. The server is designed to work with various storage backends and can be deployed on different cloud platforms.

Key features include:

- Secure authentication and access control
- App and deployment management
- Update package storage and distribution
- Metrics collection for deployment insights
- Support for multiple platforms (iOS, Android, Windows)
- Customizable storage backends (Azure, AWS, or local JSON storage)
- Extensible architecture for adding new features

The server is built with Node.js and TypeScript, providing a scalable and maintainable codebase. It uses Express.js for handling HTTP requests and supports various storage options for flexibility in deployment scenarios.

## Repository Structure

```
.
├── api/                    # Main server code
│   ├── script/             # Core server logic
│   │   ├── routes/         # API route handlers
│   │   ├── storage/        # Storage implementations
│   │   ├── utils/          # Utility functions
│   │   └── types/          # TypeScript type definitions
│   ├── test/               # Server tests
│   └── package.json        # Server dependencies
├── cli/                    # Command-line interface
│   ├── script/             # CLI implementation
│   ├── test/               # CLI tests
│   └── package.json        # CLI dependencies
├── azurite/                # Local Azure storage emulator
└── deploy.sh               # Deployment script
```

## Usage Instructions

### Installation

Prerequisites:
- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher)

Steps:
1. Clone the repository
2. Navigate to the `api` directory
3. Run `npm install` to install dependencies

### Configuration

1. Set up environment variables (see `api/ENVIRONMENT.md` for details)
2. Configure storage backend in `api/script/storage/`

### Starting the Server

1. Navigate to the `api` directory
2. Run `npm start` to start the server

### Using the CLI

1. Navigate to the `cli` directory
2. Run `npm install` to install CLI dependencies
3. Use `node script/cli.js` to run CLI commands

### Testing

1. Navigate to the `api` or `cli` directory
2. Run `npm test` to execute the test suite

### Troubleshooting

Common issues:
- Connection errors: Check storage configuration and network settings
- Authentication failures: Verify access keys and permissions

For detailed logs:
1. Set `LOGGING=true` environment variable
2. Check console output or log files in the `api` directory

## Data Flow

1. Client SDK initiates request to CodePush Server
2. Server authenticates request using access keys
3. Request is routed to appropriate handler (e.g., app management, deployment)
4. Server interacts with storage backend to retrieve or update data
5. Response is sent back to client with requested information or confirmation

```
[Client SDK] <-> [API Routes] <-> [Core Logic] <-> [Storage Layer]
                     ^
                     |
              [Authentication]
```

## Deployment

Prerequisites:
- Access to target hosting environment (e.g., Azure, AWS)
- Configured storage account and credentials

Steps:
1. Set environment variables for the target environment
2. Run `./deploy.sh` from the root directory
3. Verify server health using the `/health` endpoint

## Infrastructure

The server uses the following key resources:

- DynamoDB Table (AWS):
  - Name: `code-push-server-stage-v1`
  - Purpose: Stores app, deployment, and account data

- S3 Buckets (AWS):
  - Names: `code-push-server-stage-v1`, `my11circle-logs`
  - Purpose: Store package files and deployment history

- Azure Table (Azure):
  - Name: `storagev2`
  - Purpose: Alternative storage for app and account data

- Azure Blob Storage (Azure):
  - Containers: `storagev2`, `packagehistoryv1`
  - Purpose: Alternative storage for package files and history

The infrastructure is designed to be flexible, allowing deployment on either AWS or Azure platforms.

## API Flows

CodePush Server provides several APIs for managing apps, deployments, and updates. Here's an overview of the main APIs and their flows:

### Authentication

- **Endpoint**: `/auth`
- **Flow**:
  1. Client sends authentication request with access key
  2. Server validates the access key against the storage (DynamoDB or Azure Table)
  3. If valid, server generates a session token
  4. Session token is stored in Redis for quick subsequent validations
  5. Server responds with the session token

### App Management

- **Endpoints**: `/apps` (GET, POST, PATCH, DELETE)
- **Flow**:
  1. Request is authenticated using the session token from Redis
  2. For GET requests:
     - Server queries the storage (DynamoDB or Azure Table) for app data
     - Responds with app information
  3. For POST (create) requests:
     - Server generates a new app ID
     - Stores app data in the primary storage
     - Creates necessary deployments (e.g., Staging, Production)
     - Responds with the new app information
  4. For PATCH (update) and DELETE requests:
     - Server updates or removes app data from the storage
     - Updates related deployments if necessary
     - Responds with success or failure

### Deployment Management

- **Endpoints**: `/apps/:appName/deployments` (GET, POST, PATCH, DELETE)
- **Flow**:
  1. Request is authenticated
  2. Server validates the app exists
  3. For GET requests:
     - Queries deployment data from storage
     - Responds with deployment information
  4. For POST (create) requests:
     - Generates a new deployment key
     - Stores deployment data in storage
     - Responds with new deployment information
  5. For PATCH (update) and DELETE requests:
     - Updates or removes deployment data from storage
     - Responds with success or failure

### Release Management

- **Endpoint**: `/apps/:appName/deployments/:deploymentName/releases` (POST)
- **Flow**:
  1. Request is authenticated
  2. Server validates app and deployment
  3. Uploads the package file to blob storage (S3 or Azure Blob)
  4. Generates a diff against previous releases (if applicable)
  5. Stores release metadata in the primary storage
  6. Updates deployment information
  7. Responds with release information

### Update Check

- **Endpoint**: `/updateCheck`
- **Flow**:
  1. Client sends update check request with app and deployment information
  2. Server queries Redis for cached update information
  3. If not in cache, queries primary storage for latest release
  4. Determines if an update is available based on version and package hash
  5. If update available, generates download URL for the package
  6. Caches the result in Redis for subsequent requests
  7. Responds with update information or no update available

### Metrics

- **Endpoint**: `/reportStatus`
- **Flow**:
  1. Client reports deployment status (e.g., download, install success/failure)
  2. Server validates the report data
  3. Updates metrics in the primary storage
  4. Optionally, stores detailed logs in the history blob container
  5. Responds with acknowledgment

These API flows demonstrate how CodePush Server interacts with various storage layers (Redis, DynamoDB/Azure Table, S3/Azure Blob) to manage apps, deployments, and updates efficiently. The use of caching (Redis) and separation of concerns between different storage types allows for scalable and performant operations.