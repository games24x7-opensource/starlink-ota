"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.accessKeyRequestFromBody = accessKeyRequestFromBody;
exports.accountFromBody = accountFromBody;
exports.appFromBody = appFromBody;
exports.appCreationRequestFromBody = appCreationRequestFromBody;
exports.deploymentFromBody = deploymentFromBody;
exports.toRestAccount = toRestAccount;
exports.sortAndUpdateDisplayNameOfRestAppsList = sortAndUpdateDisplayNameOfRestAppsList;
exports.toRestApp = toRestApp;
exports.toRestCollaboratorMap = toRestCollaboratorMap;
exports.toRestDeployment = toRestDeployment;
exports.toRestDeploymentMetrics = toRestDeploymentMetrics;
exports.toRestPackage = toRestPackage;
exports.toStorageAccessKey = toStorageAccessKey;
exports.toStorageApp = toStorageApp;
exports.toStorageCollaboratorMap = toStorageCollaboratorMap;
exports.toStorageDeployment = toStorageDeployment;
exports.toStoragePackage = toStoragePackage;
const nodeDeepCopy = require("node-deepcopy");
const Storage = require("../storage/storage");
const redis = require("../redis-manager");
function accessKeyRequestFromBody(body) {
    const accessKeyRequest = {};
    if (body.createdBy !== undefined) {
        accessKeyRequest.createdBy = body.createdBy;
    }
    if (body.ttl !== undefined) {
        // Use parseInt in case the value sent to us is a string. parseInt will return the same number if it is already a number.
        accessKeyRequest.ttl = parseInt(body.ttl, 10);
    }
    if (body.name !== undefined) {
        accessKeyRequest.name = body.name;
    }
    // This caters to legacy CLIs, before "description" was renamed to "friendlyName".
    accessKeyRequest.friendlyName = body.friendlyName === undefined ? body.description : body.friendlyName;
    accessKeyRequest.friendlyName = accessKeyRequest.friendlyName && accessKeyRequest.friendlyName.trim();
    accessKeyRequest.description = accessKeyRequest.friendlyName;
    return accessKeyRequest;
}
function accountFromBody(body) {
    const account = {};
    account.name = body.name;
    account.email = body.email;
    return account;
}
function appFromBody(body) {
    const app = {};
    app.name = body.name;
    return app;
}
function appCreationRequestFromBody(body) {
    const appCreationRequest = {};
    appCreationRequest.name = body.name;
    appCreationRequest.manuallyProvisionDeployments = body.manuallyProvisionDeployments;
    return appCreationRequest;
}
function deploymentFromBody(body) {
    const deployment = {};
    deployment.name = body.name;
    deployment.key = body.key;
    return deployment;
}
function toRestAccount(storageAccount) {
    const restAccount = {
        name: storageAccount.name,
        email: storageAccount.email,
        linkedProviders: [],
    };
    if (storageAccount.azureAdId)
        restAccount.linkedProviders.push("AAD");
    if (storageAccount.gitHubId)
        restAccount.linkedProviders.push("GitHub");
    if (storageAccount.microsoftId)
        restAccount.linkedProviders.push("Microsoft");
    return restAccount;
}
function sortAndUpdateDisplayNameOfRestAppsList(apps) {
    const nameToCountMap = {};
    apps.forEach((app) => {
        nameToCountMap[app.name] = nameToCountMap[app.name] || 0;
        nameToCountMap[app.name]++;
    });
    return apps
        .sort((first, second) => {
        // Sort by raw name instead of display name
        return first.name.localeCompare(second.name);
    })
        .map((app) => {
        const storageApp = toStorageApp(app, 0);
        let name = app.name;
        if (nameToCountMap[app.name] > 1 && !Storage.isOwnedByCurrentUser(storageApp)) {
            const ownerEmail = Storage.getOwnerEmail(storageApp);
            name = `${ownerEmail}:${app.name}`;
        }
        return toRestApp(storageApp, name, app.deployments);
    });
}
function toRestApp(storageApp, displayName, deploymentNames) {
    const sortedDeploymentNames = deploymentNames
        ? deploymentNames.sort((first, second) => {
            return first.localeCompare(second);
        })
        : null;
    return {
        name: displayName,
        collaborators: toRestCollaboratorMap(storageApp.collaborators),
        deployments: sortedDeploymentNames,
    };
}
function toRestCollaboratorMap(storageCollaboratorMap) {
    const collaboratorMap = {};
    Object.keys(storageCollaboratorMap)
        .sort()
        .forEach(function (key) {
        collaboratorMap[key] = {
            isCurrentAccount: storageCollaboratorMap[key].isCurrentAccount,
            permission: storageCollaboratorMap[key].permission,
        };
    });
    return collaboratorMap;
}
function toRestDeployment(storageDeployment) {
    const restDeployment = {
        name: storageDeployment.name,
        key: storageDeployment.key,
        package: storageDeployment.package,
    };
    if (restDeployment.package) {
        delete restDeployment.package.manifestBlobUrl;
    }
    return restDeployment;
}
function toRestDeploymentMetrics(metricsFromRedis) {
    if (!metricsFromRedis) {
        return {};
    }
    const restDeploymentMetrics = {};
    const totalActive = 0;
    const labelRegex = /^v\d+$/;
    Object.keys(metricsFromRedis).forEach((metricKey) => {
        const parsedKey = metricKey.split(":");
        const label = parsedKey[0];
        const metricType = parsedKey[1];
        if (!restDeploymentMetrics[label]) {
            restDeploymentMetrics[label] = labelRegex.test(label)
                ? {
                    active: 0,
                    downloaded: 0,
                    failed: 0,
                    installed: 0,
                }
                : {
                    active: 0,
                };
        }
        switch (metricType) {
            case redis.ACTIVE:
                restDeploymentMetrics[label].active += metricsFromRedis[metricKey];
                break;
            case redis.DOWNLOADED:
                restDeploymentMetrics[label].downloaded += metricsFromRedis[metricKey];
                break;
            case redis.DEPLOYMENT_SUCCEEDED:
                restDeploymentMetrics[label].installed += metricsFromRedis[metricKey];
                break;
            case redis.DEPLOYMENT_FAILED:
                restDeploymentMetrics[label].failed += metricsFromRedis[metricKey];
                break;
        }
    });
    return restDeploymentMetrics;
}
function toRestPackage(storagePackage) {
    const copy = nodeDeepCopy.deepCopy(storagePackage);
    const cast = copy;
    delete cast.manifestBlobUrl;
    if (copy.rollout === undefined || copy.rollout === null)
        copy.rollout = 100;
    return copy;
}
function toStorageAccessKey(restAccessKey) {
    const storageAccessKey = {
        name: restAccessKey.name,
        createdTime: restAccessKey.createdTime,
        createdBy: restAccessKey.createdBy,
        expires: restAccessKey.expires,
        friendlyName: restAccessKey.friendlyName,
        description: restAccessKey.friendlyName,
    };
    return storageAccessKey;
}
function toStorageApp(restApp, createdTime) {
    const storageApp = {
        createdTime: createdTime,
        name: restApp.name,
        collaborators: toStorageCollaboratorMap(restApp.collaborators),
    };
    return storageApp;
}
function toStorageCollaboratorMap(restCollaboratorMap) {
    if (!restCollaboratorMap)
        return null;
    return nodeDeepCopy.deepCopy(restCollaboratorMap);
}
function toStorageDeployment(restDeployment, createdTime) {
    const storageDeployment = {
        createdTime: createdTime,
        name: restDeployment.name,
        key: restDeployment.key,
        package: nodeDeepCopy.deepCopy(restDeployment.package),
    };
    return storageDeployment;
}
function toStoragePackage(restPackage) {
    return nodeDeepCopy.deepCopy(restPackage);
}
