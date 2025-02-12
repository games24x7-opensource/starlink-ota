"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getManagementRouter = getManagementRouter;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const q_1 = __importDefault(require("q"));
const semver_1 = __importDefault(require("semver"));
const streamifier_1 = __importDefault(require("streamifier"));
const tryJSON = require("try-json");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const file_upload_manager_1 = require("../file-upload-manager");
const rest_headers_1 = require("../utils/rest-headers");
const rollout_selector_1 = require("../utils/rollout-selector");
const hashUtils = __importStar(require("../utils/hash-utils"));
const redis = __importStar(require("../redis-manager"));
const security = __importStar(require("../utils/security"));
const storageTypes = __importStar(require("../storage/storage"));
const validationUtils = __importStar(require("../utils/validation"));
const packageDiffing = __importStar(require("../utils/package-diffing"));
const converterUtils = __importStar(require("../utils/converter"));
const diffErrorUtils = __importStar(require("../utils/diff-error-handling"));
const errorUtils = __importStar(require("../utils/rest-error-handling"));
const storage_1 = require("../storage/storage");
const Logger = require("../logger");
var PackageDiffer = packageDiffing.PackageDiffer;
var NameResolver = storageTypes.NameResolver;
const DEFAULT_ACCESS_KEY_EXPIRY = 1000 * 60 * 60 * 24 * 60; // 60 days
const ACCESS_KEY_MASKING_STRING = "(hidden)";
// A template string tag function that URL encodes the substituted values
function urlEncode(strings, ...values) {
    let result = "";
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i < values.length) {
            result += encodeURIComponent(values[i]);
        }
    }
    return result;
}
function getManagementRouter(config) {
    const redisManager = config.redisManager;
    const storage = config.storage;
    const packageDiffing = new PackageDiffer(storage, parseInt(process.env.DIFF_PACKAGE_COUNT) || 5);
    const router = (0, express_1.Router)();
    const nameResolver = new NameResolver(config.storage);
    router.get("/account", (req, res, next) => {
        const accountId = req.user.id;
        storage
            .getAccount(accountId)
            .then((storageAccount) => {
            const restAccount = converterUtils.toRestAccount(storageAccount);
            res.send({ account: restAccount });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.post("/account", (req, res, next) => {
        const newUser = {
            createdTime: new Date().getTime(),
            email: process.env.DEFAULT_USER_EMAIL || "starlink-ota@games24x7.com",
            name: process.env.DEFAULT_USER_NAME || "starlink.user",
        };
        storage
            .addAccount(newUser)
            .then((accountId) => {
            res.send({ accountId: accountId });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.get("/accessKeys", (req, res, next) => {
        const accountId = req.user.id;
        storage
            .getAccessKeys(accountId)
            .then((accessKeys) => {
            accessKeys.sort((first, second) => {
                const firstTime = first.createdTime || 0;
                const secondTime = second.createdTime || 0;
                return firstTime - secondTime;
            });
            // Hide the actual key string and replace it with a message for legacy CLIs (up to 1.11.0-beta) that still try to display it
            accessKeys.forEach((accessKey) => {
                accessKey.name = ACCESS_KEY_MASKING_STRING;
            });
            res.send({ accessKeys: accessKeys });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.post("/accessKeys", (req, res, next) => {
        const accountId = req.user.id;
        const accessKeyRequest = converterUtils.accessKeyRequestFromBody(req.body);
        if (!accessKeyRequest.name) {
            accessKeyRequest.name = security.generateSecureKey(accountId);
        }
        if (!accessKeyRequest.createdBy) {
            accessKeyRequest.createdBy = (0, rest_headers_1.getIpAddress)(req);
        }
        const validationErrors = validationUtils.validateAccessKeyRequest(accessKeyRequest, 
        /*isUpdate=*/ false);
        if (validationErrors.length) {
            res.status(400).send(validationErrors);
            return;
        }
        const accessKey = accessKeyRequest;
        accessKey.createdTime = new Date().getTime();
        accessKey.expires = accessKey.createdTime + (accessKeyRequest.ttl || DEFAULT_ACCESS_KEY_EXPIRY);
        delete accessKeyRequest.ttl;
        storage
            .getAccessKeys(accountId)
            .then((accessKeys) => {
            if (NameResolver.isDuplicate(accessKeys, accessKey.name)) {
                errorUtils.sendConflictError(res, `The access key "${accessKey.name}" already exists.`);
                return;
            }
            else if (NameResolver.isDuplicate(accessKeys, accessKey.friendlyName)) {
                errorUtils.sendConflictError(res, `The access key "${accessKey.friendlyName}" already exists.`);
                return;
            }
            const storageAccessKey = converterUtils.toStorageAccessKey(accessKey);
            return storage.addAccessKey(accountId, storageAccessKey).then((id) => {
                res.setHeader("Location", urlEncode([`/accessKeys/${accessKey.friendlyName}`]));
                res.status(201).send({ accessKey: accessKey });
            });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.get("/accessKeys/:accessKeyName", (req, res, next) => {
        const accessKeyName = req.params.accessKeyName;
        const accountId = req.user.id;
        nameResolver
            .resolveAccessKey(accountId, accessKeyName)
            .then((accessKey) => {
            delete accessKey.name;
            res.send({ accessKey: accessKey });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.patch("/accessKeys/:accessKeyName", (req, res, next) => {
        const accountId = req.user.id;
        const accessKeyName = req.params.accessKeyName;
        const accessKeyRequest = converterUtils.accessKeyRequestFromBody(req.body);
        const validationErrors = validationUtils.validateAccessKeyRequest(accessKeyRequest, 
        /*isUpdate=*/ true);
        if (validationErrors.length) {
            res.status(400).send(validationErrors);
            return;
        }
        let updatedAccessKey;
        storage
            .getAccessKeys(accountId)
            .then((accessKeys) => {
            updatedAccessKey = NameResolver.findByName(accessKeys, accessKeyName);
            if (!updatedAccessKey) {
                throw errorUtils.restError(errorUtils.ErrorCode.NotFound, `The access key "${accessKeyName}" does not exist.`);
            }
            if (accessKeyRequest.friendlyName) {
                if (NameResolver.isDuplicate(accessKeys, accessKeyRequest.friendlyName)) {
                    throw errorUtils.restError(errorUtils.ErrorCode.Conflict, `The access key "${accessKeyRequest.friendlyName}" already exists.`);
                }
                updatedAccessKey.friendlyName = accessKeyRequest.friendlyName;
                updatedAccessKey.description = updatedAccessKey.friendlyName;
            }
            if (accessKeyRequest.ttl !== undefined) {
                updatedAccessKey.expires = new Date().getTime() + accessKeyRequest.ttl;
            }
            return storage.updateAccessKey(accountId, updatedAccessKey);
        })
            .then(() => {
            delete updatedAccessKey.name;
            res.send({ accessKey: updatedAccessKey });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.delete("/accessKeys/:accessKeyName", (req, res, next) => {
        const accountId = req.user.id;
        const accessKeyName = req.params.accessKeyName;
        nameResolver
            .resolveAccessKey(accountId, accessKeyName)
            .then((accessKey) => {
            return storage.removeAccessKey(accountId, accessKey.id);
        })
            .then(() => {
            res.sendStatus(204);
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.delete("/sessions/:createdBy", (req, res, next) => {
        const accountId = req.user.id;
        const createdBy = req.params.createdBy;
        storage
            .getAccessKeys(accountId)
            .then((accessKeys) => {
            const accessKeyDeletionPromises = [];
            accessKeys.forEach((accessKey) => {
                if (accessKey.isSession && accessKey.createdBy === createdBy) {
                    accessKeyDeletionPromises.push(storage.removeAccessKey(accountId, accessKey.id));
                }
            });
            if (accessKeyDeletionPromises.length) {
                return q_1.default.all(accessKeyDeletionPromises);
            }
            else {
                throw errorUtils.restError(errorUtils.ErrorCode.NotFound, `There are no sessions associated with "${createdBy}."`);
            }
        })
            .then(() => {
            res.sendStatus(204);
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.get("/apps", (req, res, next) => {
        const accountId = req.user.id;
        storage
            .getApps(accountId)
            .then((apps) => {
            const restAppPromises = apps.map((app) => {
                return storage.getDeployments(accountId, app.id).then((deployments) => {
                    const deploymentNames = deployments.map((deployment) => deployment.name);
                    return converterUtils.toRestApp(app, app.name, deploymentNames);
                });
            });
            return q_1.default.all(restAppPromises);
        })
            .then((restApps) => {
            Logger.instance("[Starlink::Admin::").setExpressReq(req).setUpstreamResponse({ body: restApps }).log();
            res.send({ apps: converterUtils.sortAndUpdateDisplayNameOfRestAppsList(restApps) });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.post("/apps", (req, res, next) => {
        const accountId = req.user.id;
        const appRequest = converterUtils.appCreationRequestFromBody(req.body);
        const validationErrors = validationUtils.validateApp(appRequest, /*isUpdate=*/ false);
        if (validationErrors.length) {
            errorUtils.sendMalformedRequestError(res, JSON.stringify(validationErrors));
        }
        else {
            storage
                .getApps(accountId)
                .then((apps) => {
                if (NameResolver.isDuplicate(apps, appRequest.name)) {
                    errorUtils.sendConflictError(res, "An app named '" + appRequest.name + "' already exists.");
                    return;
                }
                let storageApp = converterUtils.toStorageApp(appRequest, new Date().getTime());
                return storage
                    .addApp(accountId, storageApp)
                    .then((app) => {
                    storageApp = app;
                    if (!appRequest.manuallyProvisionDeployments) {
                        const defaultDeployments = ["Production", "Staging"];
                        const deploymentPromises = defaultDeployments.map((deploymentName) => {
                            const deployment = {
                                createdTime: new Date().getTime(),
                                name: deploymentName,
                                key: security.generateSecureKey(accountId),
                            };
                            return storage.addDeployment(accountId, storageApp.id, deployment).then(() => {
                                return deployment.name;
                            });
                        });
                        return q_1.default.all(deploymentPromises);
                    }
                })
                    .then((deploymentNames) => {
                    res.setHeader("Location", urlEncode([`/apps/${storageApp.name}`]));
                    let respData = converterUtils.toRestApp(storageApp, /*displayName=*/ storageApp.name, deploymentNames);
                    Logger.instance("[Starlink::Admin::")
                        .setExpressReq(req)
                        .setUpstreamRequestParams(appRequest)
                        .setUpstreamResponse({ body: respData })
                        .log();
                    res.status(201).send({ app: respData });
                });
            })
                .catch((error) => {
                Logger.instance("[Starlink::Admin::").setExpressReq(req).setError(error).log();
                errorUtils.restErrorHandler(res, error, next);
            })
                .done();
        }
    });
    router.get("/apps/:appName", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        let storageApp;
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            storageApp = app;
            return storage.getDeployments(accountId, app.id);
        })
            .then((deployments) => {
            const deploymentNames = deployments.map((deployment) => deployment.name);
            res.send({ app: converterUtils.toRestApp(storageApp, /*displayName=*/ appName, deploymentNames) });
        })
            .catch((error) => {
            Logger.instance("[Starlink::Admin::").setExpressReq(req).setError(error).log();
            errorUtils.restErrorHandler(res, error, next);
        })
            .done();
    });
    router.delete("/apps/:appName", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        let appId;
        let invalidationError;
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            appId = app.id;
            throwIfInvalidPermissions(app, storageTypes.Permissions.Owner);
            return storage.getDeployments(accountId, appId);
        })
            .then((deployments) => {
            const invalidationPromises = deployments.map((deployment) => {
                return invalidateCachedPackage(deployment.key);
            });
            return q_1.default.all(invalidationPromises).catch((error) => {
                invalidationError = error; // Do not block app deletion on cache invalidation
            });
        })
            .then(() => {
            return storage.removeApp(accountId, appId);
        })
            .then(() => {
            res.sendStatus(204);
            if (invalidationError)
                throw invalidationError;
        })
            .catch((error) => {
            Logger.instance("[Starlink::Admin::").setExpressReq(req).setError(error).log();
            errorUtils.restErrorHandler(res, error, next);
        })
            .done();
    });
    router.patch("/apps/:appName", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const app = converterUtils.appFromBody(req.body);
        storage
            .getApps(accountId)
            .then((apps) => {
            const existingApp = NameResolver.findByName(apps, appName);
            if (!existingApp) {
                errorUtils.sendNotFoundError(res, `App "${appName}" does not exist.`);
                return;
            }
            throwIfInvalidPermissions(existingApp, storageTypes.Permissions.Owner);
            if ((app.name || app.name === "") && app.name !== existingApp.name) {
                if (NameResolver.isDuplicate(apps, app.name)) {
                    errorUtils.sendConflictError(res, "An app named '" + app.name + "' already exists.");
                    return;
                }
                existingApp.name = app.name;
            }
            const validationErrors = validationUtils.validateApp(existingApp, /*isUpdate=*/ true);
            if (validationErrors.length) {
                errorUtils.sendMalformedRequestError(res, JSON.stringify(validationErrors));
            }
            else {
                return storage
                    .updateApp(accountId, existingApp)
                    .then(() => {
                    return storage.getDeployments(accountId, existingApp.id).then((deployments) => {
                        const deploymentNames = deployments.map((deployment) => {
                            return deployment.name;
                        });
                        return converterUtils.toRestApp(existingApp, existingApp.name, deploymentNames);
                    });
                })
                    .then((restApp) => {
                    res.send({ app: restApp });
                });
            }
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.post("/apps/:appName/transfer/:email", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const email = req.params.email;
        if ((0, storage_1.isPrototypePollutionKey)(email)) {
            return res.status(400).send("Invalid email parameter");
        }
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            throwIfInvalidPermissions(app, storageTypes.Permissions.Owner);
            return storage.transferApp(accountId, app.id, email);
        })
            .then(() => {
            res.sendStatus(201);
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.post("/apps/:appName/collaborators/:email", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const email = req.params.email;
        if ((0, storage_1.isPrototypePollutionKey)(email)) {
            return res.status(400).send("Invalid email parameter");
        }
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            throwIfInvalidPermissions(app, storageTypes.Permissions.Owner);
            return storage.addCollaborator(accountId, app.id, email);
        })
            .then(() => {
            res.sendStatus(201);
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.get("/apps/:appName/collaborators", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            throwIfInvalidPermissions(app, storageTypes.Permissions.Collaborator);
            return storage.getCollaborators(accountId, app.id);
        })
            .then((retrievedMap) => {
            res.send({ collaborators: converterUtils.toRestCollaboratorMap(retrievedMap) });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.delete("/apps/:appName/collaborators/:email", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const email = req.params.email;
        if ((0, storage_1.isPrototypePollutionKey)(email)) {
            return res.status(400).send("Invalid email parameter");
        }
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            const isAttemptingToRemoveSelf = app.collaborators && email && app.collaborators[email] && app.collaborators[email].isCurrentAccount;
            throwIfInvalidPermissions(app, isAttemptingToRemoveSelf ? storageTypes.Permissions.Collaborator : storageTypes.Permissions.Owner);
            return storage.removeCollaborator(accountId, app.id, email);
        })
            .then(() => {
            res.sendStatus(204);
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.get("/apps/:appName/deployments", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        let appId;
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            appId = app.id;
            throwIfInvalidPermissions(app, storageTypes.Permissions.Collaborator);
            return storage.getDeployments(accountId, appId);
        })
            .then((deployments) => {
            deployments.sort((first, second) => {
                return first.name.localeCompare(second.name);
            });
            res.send({ deployments: deployments });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.post("/apps/:appName/deployments", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        let appId;
        let restDeployment = converterUtils.deploymentFromBody(req.body);
        const validationErrors = validationUtils.validateDeployment(restDeployment, /*isUpdate=*/ false);
        if (validationErrors.length) {
            errorUtils.sendMalformedRequestError(res, JSON.stringify(validationErrors));
            return;
        }
        const storageDeployment = converterUtils.toStorageDeployment(restDeployment, new Date().getTime());
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            appId = app.id;
            throwIfInvalidPermissions(app, storageTypes.Permissions.Owner);
            return storage.getDeployments(accountId, app.id);
        })
            .then((deployments) => {
            if (NameResolver.isDuplicate(deployments, restDeployment.name)) {
                errorUtils.sendConflictError(res, "A deployment named '" + restDeployment.name + "' already exists.");
                return;
            }
            // Allow the deployment key to be specified on creation, if desired
            storageDeployment.key = restDeployment.key || security.generateSecureKey(accountId);
            return storage.addDeployment(accountId, appId, storageDeployment).then((deploymentId) => {
                restDeployment = converterUtils.toRestDeployment(storageDeployment);
                res.setHeader("Location", urlEncode([`/apps/${appName}/deployments/${restDeployment.name}`]));
                res.status(201).send({ deployment: restDeployment });
            });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.get("/apps/:appName/deployments/:deploymentName", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const deploymentName = req.params.deploymentName;
        let appId;
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            appId = app.id;
            throwIfInvalidPermissions(app, storageTypes.Permissions.Collaborator);
            return nameResolver.resolveDeployment(accountId, appId, deploymentName);
        })
            .then((deployment) => {
            const restDeployment = converterUtils.toRestDeployment(deployment);
            res.send({ deployment: restDeployment });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.delete("/apps/:appName/deployments/:deploymentName", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const deploymentName = req.params.deploymentName;
        let appId;
        let deploymentId;
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            appId = app.id;
            throwIfInvalidPermissions(app, storageTypes.Permissions.Owner);
            return nameResolver.resolveDeployment(accountId, appId, deploymentName);
        })
            .then((deployment) => {
            deploymentId = deployment.id;
            return invalidateCachedPackage(deployment.key);
        })
            .then(() => {
            return storage.removeDeployment(accountId, appId, deploymentId);
        })
            .then(() => {
            res.sendStatus(204);
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.patch("/apps/:appName/deployments/:deploymentName", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const deploymentName = req.params.deploymentName;
        let appId;
        let restDeployment = converterUtils.deploymentFromBody(req.body);
        const validationErrors = validationUtils.validateDeployment(restDeployment, /*isUpdate=*/ true);
        if (validationErrors.length) {
            errorUtils.sendMalformedRequestError(res, JSON.stringify(validationErrors));
            return;
        }
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            appId = app.id;
            throwIfInvalidPermissions(app, storageTypes.Permissions.Owner);
            return storage.getDeployments(accountId, app.id);
        })
            .then((storageDeployments) => {
            const storageDeployment = NameResolver.findByName(storageDeployments, deploymentName);
            if (!storageDeployment) {
                errorUtils.sendNotFoundError(res, `Deployment "${deploymentName}" does not exist.`);
                return;
            }
            if ((restDeployment.name || restDeployment.name === "") && restDeployment.name !== storageDeployment.name) {
                if (NameResolver.isDuplicate(storageDeployments, restDeployment.name)) {
                    errorUtils.sendConflictError(res, "A deployment named '" + restDeployment.name + "' already exists.");
                    return;
                }
                storageDeployment.name = restDeployment.name;
            }
            restDeployment = converterUtils.toRestDeployment(storageDeployment);
            return storage.updateDeployment(accountId, appId, storageDeployment).then(() => {
                res.send({ deployment: restDeployment });
            });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.patch("/apps/:appName/deployments/:deploymentName/release", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const deploymentName = req.params.deploymentName;
        const info = req.body.packageInfo || {};
        const validationErrors = validationUtils.validatePackageInfo(info, /*allOptional*/ true);
        if (validationErrors.length) {
            errorUtils.sendMalformedRequestError(res, JSON.stringify(validationErrors));
            return;
        }
        let updateRelease = false;
        let storageDeployment;
        let appId;
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            appId = app.id;
            throwIfInvalidPermissions(app, storageTypes.Permissions.Collaborator);
            return storage.getDeployments(accountId, app.id);
        })
            .then((storageDeployments) => {
            storageDeployment = NameResolver.findByName(storageDeployments, deploymentName);
            if (!storageDeployment) {
                throw errorUtils.restError(errorUtils.ErrorCode.NotFound, `Deployment "${deploymentName}" does not exist.`);
            }
            return storage.getPackageHistory(accountId, appId, storageDeployment.id);
        })
            .then((packageHistory) => {
            if (!packageHistory.length) {
                throw errorUtils.restError(errorUtils.ErrorCode.NotFound, "Deployment has no releases.");
            }
            const packageToUpdate = info.label
                ? getPackageFromLabel(packageHistory, info.label)
                : packageHistory[packageHistory.length - 1];
            if (!packageToUpdate) {
                throw errorUtils.restError(errorUtils.ErrorCode.NotFound, "Release not found for given label.");
            }
            const newIsDisabled = info.isDisabled;
            if (validationUtils.isDefined(newIsDisabled) && packageToUpdate.isDisabled !== newIsDisabled) {
                packageToUpdate.isDisabled = newIsDisabled;
                updateRelease = true;
            }
            const newIsMandatory = info.isMandatory;
            if (validationUtils.isDefined(newIsMandatory) && packageToUpdate.isMandatory !== newIsMandatory) {
                packageToUpdate.isMandatory = newIsMandatory;
                updateRelease = true;
            }
            if (info.description && packageToUpdate.description !== info.description) {
                packageToUpdate.description = info.description;
                updateRelease = true;
            }
            const newRolloutValue = info.rollout;
            if (validationUtils.isDefined(newRolloutValue)) {
                let errorMessage;
                if (!(0, rollout_selector_1.isUnfinishedRollout)(packageToUpdate.rollout)) {
                    errorMessage = "Cannot update rollout value for a completed rollout release.";
                }
                else if (packageToUpdate.rollout >= newRolloutValue) {
                    errorMessage = `Rollout value must be greater than "${packageToUpdate.rollout}", the existing value.`;
                }
                if (errorMessage) {
                    throw errorUtils.restError(errorUtils.ErrorCode.Conflict, errorMessage);
                }
                packageToUpdate.rollout = newRolloutValue === 100 ? null : newRolloutValue;
                updateRelease = true;
            }
            const newAppVersion = info.appVersion;
            if (newAppVersion && packageToUpdate.appVersion !== newAppVersion) {
                packageToUpdate.appVersion = newAppVersion;
                updateRelease = true;
            }
            if (updateRelease) {
                return storage.updatePackageHistory(accountId, appId, storageDeployment.id, packageHistory).then(() => {
                    Logger.instance("[Starlink::Admin::UpdateRelease::success")
                        .setExpressReq(req)
                        .setUpstreamRequestParams({ appName, deploymentName, accountId, info })
                        .setUpstreamResponse({ body: converterUtils.toRestPackage(packageToUpdate) })
                        .log();
                    res.send({ package: converterUtils.toRestPackage(packageToUpdate) });
                    return invalidateCachedPackage(storageDeployment.key);
                });
            }
            else {
                Logger.instance("[Starlink::Admin::UpdateRelease::no-update")
                    .setExpressReq(req)
                    .setUpstreamRequestParams({ appName, deploymentName, accountId, info })
                    .log();
                res.sendStatus(204);
            }
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    const releaseRateLimiter = (0, express_rate_limit_1.default)({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
    });
    router.post("/apps/:appName/deployments/:deploymentName/release", releaseRateLimiter, (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const deploymentName = req.params.deploymentName;
        const file = (0, file_upload_manager_1.getFileWithField)(req, "package");
        if (!file || !file.buffer) {
            errorUtils.sendMalformedRequestError(res, "A deployment package must include a file.");
            return;
        }
        const filePath = (0, file_upload_manager_1.createTempFileFromBuffer)(file.buffer);
        const restPackage = tryJSON(req.body.packageInfo) || {};
        const validationErrors = validationUtils.validatePackageInfo(restPackage, 
        /*allOptional*/ false);
        if (validationErrors.length) {
            errorUtils.sendMalformedRequestError(res, JSON.stringify(validationErrors));
            return;
        }
        fs_1.default.stat(filePath, (err, stats) => {
            if (err) {
                errorUtils.sendUnknownError(res, err, next);
                return;
            }
            // These variables are for hoisting promise results and flattening the following promise chain.
            let appId;
            let deploymentToReleaseTo;
            let storagePackage;
            let lastPackageHashWithSameAppVersion;
            let newManifest;
            nameResolver
                .resolveApp(accountId, appName)
                .then((app) => {
                appId = app.id;
                throwIfInvalidPermissions(app, storageTypes.Permissions.Collaborator);
                return nameResolver.resolveDeployment(accountId, appId, deploymentName);
            })
                .then((deployment) => {
                deploymentToReleaseTo = deployment;
                const existingPackage = deployment.package;
                if (existingPackage && (0, rollout_selector_1.isUnfinishedRollout)(existingPackage.rollout) && !existingPackage.isDisabled) {
                    throw errorUtils.restError(errorUtils.ErrorCode.Conflict, "Please update the previous release to 100% rollout before releasing a new package.");
                }
                return storage.getPackageHistory(accountId, appId, deploymentToReleaseTo.id);
            })
                .then((history) => {
                lastPackageHashWithSameAppVersion = getLastPackageHashWithSameAppVersion(history, restPackage.appVersion);
                return hashUtils.generatePackageManifestFromZip(filePath);
            })
                .then((manifest) => {
                if (manifest) {
                    newManifest = manifest;
                    // If update is a zip, generate a packageHash using the manifest, since
                    // that more accurately represents the contents of each file in the zip.
                    return newManifest.computePackageHash();
                }
                else {
                    // Update is not a zip (flat file), generate the packageHash over the
                    // entire file contents.
                    return hashUtils.hashFile(filePath);
                }
            })
                .then((packageHash) => {
                restPackage.packageHash = packageHash;
                if (restPackage.packageHash === lastPackageHashWithSameAppVersion) {
                    throw errorUtils.restError(errorUtils.ErrorCode.Conflict, "The uploaded package was not released because it is identical to the contents of the specified deployment's current release.");
                }
                return storage.addBlob(security.generateSecureKey(accountId), fs_1.default.createReadStream(filePath), stats.size);
            })
                .then((blobId) => storage.getBlobUrl(blobId))
                .then((blobUrl) => {
                restPackage.blobUrl = blobUrl;
                restPackage.size = stats.size;
                // If newManifest is null/undefined, then the package is not a valid ZIP file.
                if (newManifest) {
                    const json = newManifest.serialize();
                    const readStream = streamifier_1.default.createReadStream(json);
                    return storage.addBlob(security.generateSecureKey(accountId), readStream, json.length);
                }
                return (0, q_1.default)(null);
            })
                .then((blobId) => {
                if (blobId) {
                    return storage.getBlobUrl(blobId);
                }
                return (0, q_1.default)(null);
            })
                .then((manifestBlobUrl) => {
                storagePackage = converterUtils.toStoragePackage(restPackage);
                if (manifestBlobUrl) {
                    storagePackage.manifestBlobUrl = manifestBlobUrl;
                }
                storagePackage.releaseMethod = storageTypes.ReleaseMethod.Upload;
                storagePackage.uploadTime = new Date().getTime();
                return storage.commitPackage(accountId, appId, deploymentToReleaseTo.id, storagePackage);
            })
                .then((committedPackage) => {
                storagePackage.label = committedPackage.label;
                const restPackage = converterUtils.toRestPackage(committedPackage);
                res.setHeader("Location", urlEncode([`/apps/${appName}/deployments/${deploymentName}`]));
                res.status(201).send({ package: restPackage }); // Send response without blocking on cleanup
                return invalidateCachedPackage(deploymentToReleaseTo.key);
            })
                .then(() => processDiff(accountId, appId, deploymentToReleaseTo.id, storagePackage))
                .finally(() => {
                // Cleanup; any errors before this point will still pass to the catch() block
                fs_1.default.unlink(filePath, (err) => {
                    if (err) {
                        errorUtils.sendUnknownError(res, err, next);
                    }
                });
            })
                .catch((error) => errorUtils.restErrorHandler(res, error, next))
                .done();
        });
    });
    router.delete("/apps/:appName/deployments/:deploymentName/history", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const deploymentName = req.params.deploymentName;
        let appId;
        let deploymentToGetHistoryOf;
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            appId = app.id;
            throwIfInvalidPermissions(app, storageTypes.Permissions.Owner);
            return nameResolver.resolveDeployment(accountId, appId, deploymentName);
        })
            .then((deployment) => {
            deploymentToGetHistoryOf = deployment;
            return storage.clearPackageHistory(accountId, appId, deploymentToGetHistoryOf.id);
        })
            .then(() => {
            if (redisManager.isEnabled) {
                return redisManager.clearMetricsForDeploymentKey(deploymentToGetHistoryOf.key);
            }
            else {
                return (0, q_1.default)(null);
            }
        })
            .then(() => {
            res.sendStatus(204);
            return invalidateCachedPackage(deploymentToGetHistoryOf.key);
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.get("/apps/:appName/deployments/:deploymentName/history", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const deploymentName = req.params.deploymentName;
        let appId;
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            appId = app.id;
            throwIfInvalidPermissions(app, storageTypes.Permissions.Collaborator);
            return nameResolver.resolveDeployment(accountId, appId, deploymentName);
        })
            .then((deployment) => {
            return storage.getPackageHistory(accountId, appId, deployment.id);
        })
            .then((packageHistory) => {
            Logger.instance("[Starlink::Admin::GetPackageHistory")
                .setExpressReq(req)
                .setUpstreamRequestParams({ appName, deploymentName, accountId })
                .setUpstreamResponse({ body: packageHistory })
                .log();
            res.send({ history: packageHistory });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    /**
     * TODO: Not working API Timeout
     */
    router.get("/apps/:appName/deployments/:deploymentName/metrics", (req, res, next) => {
        if (!redisManager.isEnabled) {
            res.send({ metrics: {} });
        }
        else {
            const accountId = req.user.id;
            const appName = req.params.appName;
            const deploymentName = req.params.deploymentName;
            let appId;
            nameResolver
                .resolveApp(accountId, appName)
                .then((app) => {
                appId = app.id;
                throwIfInvalidPermissions(app, storageTypes.Permissions.Collaborator);
                return nameResolver.resolveDeployment(accountId, appId, deploymentName);
            })
                .then((deployment) => {
                return redisManager.getMetricsWithDeploymentKey(deployment.key);
            })
                .then((metrics) => {
                const deploymentMetrics = converterUtils.toRestDeploymentMetrics(metrics);
                Logger.instance("[Starlink::Admin::GetDeploymentMetrics")
                    .setExpressReq(req)
                    .setUpstreamRequestParams({ appName, deploymentName, accountId })
                    .setUpstreamResponse({ body: deploymentMetrics })
                    .log();
                res.send({ metrics: deploymentMetrics });
            })
                .catch((error) => errorUtils.restErrorHandler(res, error, next))
                .done();
        }
    });
    router.post("/apps/:appName/deployments/:sourceDeploymentName/promote/:destDeploymentName", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const sourceDeploymentName = req.params.sourceDeploymentName;
        const destDeploymentName = req.params.destDeploymentName;
        const info = req.body.packageInfo || {};
        const validationErrors = validationUtils.validatePackageInfo(info, /*allOptional*/ true);
        if (validationErrors.length) {
            errorUtils.sendMalformedRequestError(res, JSON.stringify(validationErrors));
            return;
        }
        let appId;
        let destDeployment;
        let sourcePackage;
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            appId = app.id;
            throwIfInvalidPermissions(app, storageTypes.Permissions.Collaborator);
            // Get source and dest manifests in parallel.
            return q_1.default.all([
                nameResolver.resolveDeployment(accountId, appId, sourceDeploymentName),
                nameResolver.resolveDeployment(accountId, appId, destDeploymentName),
            ]);
        })
            .spread((sourceDeployment, destinationDeployment) => {
            destDeployment = destinationDeployment;
            if (info.label) {
                return storage.getPackageHistory(accountId, appId, sourceDeployment.id).then((sourceHistory) => {
                    sourcePackage = getPackageFromLabel(sourceHistory, info.label);
                });
            }
            else {
                sourcePackage = sourceDeployment.package;
            }
        })
            .then(() => {
            const destPackage = destDeployment.package;
            if (!sourcePackage) {
                throw errorUtils.restError(errorUtils.ErrorCode.NotFound, "Cannot promote from a deployment with no enabled releases.");
            }
            else if (validationUtils.isDefined(info.rollout) && !validationUtils.isValidRolloutField(info.rollout)) {
                throw errorUtils.restError(errorUtils.ErrorCode.MalformedRequest, "Rollout value must be an integer between 1 and 100, inclusive.");
            }
            else if (destPackage && (0, rollout_selector_1.isUnfinishedRollout)(destPackage.rollout) && !destPackage.isDisabled) {
                throw errorUtils.restError(errorUtils.ErrorCode.Conflict, "Cannot promote to an unfinished rollout release unless it is already disabled.");
            }
            return storage.getPackageHistory(accountId, appId, destDeployment.id);
        })
            .then((destHistory) => {
            if (sourcePackage.packageHash === getLastPackageHashWithSameAppVersion(destHistory, sourcePackage.appVersion)) {
                throw errorUtils.restError(errorUtils.ErrorCode.Conflict, "The uploaded package was not promoted because it is identical to the contents of the targeted deployment's current release.");
            }
            const isMandatory = validationUtils.isDefined(info.isMandatory) ? info.isMandatory : sourcePackage.isMandatory;
            const newPackage = {
                appVersion: info.appVersion ? info.appVersion : sourcePackage.appVersion,
                blobUrl: sourcePackage.blobUrl,
                description: info.description || sourcePackage.description,
                isDisabled: validationUtils.isDefined(info.isDisabled) ? info.isDisabled : sourcePackage.isDisabled,
                isMandatory: isMandatory,
                manifestBlobUrl: sourcePackage.manifestBlobUrl,
                packageHash: sourcePackage.packageHash,
                rollout: info.rollout || null,
                size: sourcePackage.size,
                uploadTime: new Date().getTime(),
                releaseMethod: storageTypes.ReleaseMethod.Promote,
                originalLabel: sourcePackage.label,
                originalDeployment: sourceDeploymentName,
            };
            return storage
                .commitPackage(accountId, appId, destDeployment.id, newPackage)
                .then((committedPackage) => {
                sourcePackage.label = committedPackage.label;
                const restPackage = converterUtils.toRestPackage(committedPackage);
                res.setHeader("Location", urlEncode([`/apps/${appName}/deployments/${destDeploymentName}`]));
                res.status(201).send({ package: restPackage });
                return invalidateCachedPackage(destDeployment.key);
            })
                .then(() => processDiff(accountId, appId, destDeployment.id, sourcePackage));
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    router.post("/apps/:appName/deployments/:deploymentName/rollback/:targetRelease?", (req, res, next) => {
        const accountId = req.user.id;
        const appName = req.params.appName;
        const deploymentName = req.params.deploymentName;
        let appId;
        let deploymentToRollback;
        const targetRelease = req.params.targetRelease;
        let destinationPackage;
        nameResolver
            .resolveApp(accountId, appName)
            .then((app) => {
            appId = app.id;
            throwIfInvalidPermissions(app, storageTypes.Permissions.Collaborator);
            return nameResolver.resolveDeployment(accountId, appId, deploymentName);
        })
            .then((deployment) => {
            deploymentToRollback = deployment;
            return storage.getPackageHistory(accountId, appId, deployment.id);
        })
            .then((packageHistory) => {
            const sourcePackage = packageHistory && packageHistory.length ? packageHistory[packageHistory.length - 1] : null;
            if (!sourcePackage) {
                errorUtils.sendNotFoundError(res, "Cannot perform rollback because there are no releases on this deployment.");
                return;
            }
            if (!targetRelease) {
                destinationPackage = packageHistory[packageHistory.length - 2];
                if (!destinationPackage) {
                    errorUtils.sendNotFoundError(res, "Cannot perform rollback because there are no prior releases to rollback to.");
                    return;
                }
            }
            else {
                if (targetRelease === sourcePackage.label) {
                    errorUtils.sendConflictError(res, `Cannot perform rollback because the target release (${targetRelease}) is already the latest release.`);
                    return;
                }
                packageHistory.forEach((packageEntry) => {
                    if (packageEntry.label === targetRelease) {
                        destinationPackage = packageEntry;
                    }
                });
                if (!destinationPackage) {
                    errorUtils.sendNotFoundError(res, `Cannot perform rollback because the target release (${targetRelease}) could not be found in the deployment history.`);
                    return;
                }
            }
            if (sourcePackage.appVersion !== destinationPackage.appVersion) {
                errorUtils.sendConflictError(res, "Cannot perform rollback to a different app version. Please perform a new release with the desired replacement package.");
                return;
            }
            const newPackage = {
                appVersion: destinationPackage.appVersion,
                blobUrl: destinationPackage.blobUrl,
                description: destinationPackage.description,
                diffPackageMap: destinationPackage.diffPackageMap,
                isDisabled: destinationPackage.isDisabled,
                isMandatory: destinationPackage.isMandatory,
                manifestBlobUrl: destinationPackage.manifestBlobUrl,
                packageHash: destinationPackage.packageHash,
                size: destinationPackage.size,
                uploadTime: new Date().getTime(),
                releaseMethod: storageTypes.ReleaseMethod.Rollback,
                originalLabel: destinationPackage.label,
            };
            return storage.commitPackage(accountId, appId, deploymentToRollback.id, newPackage).then(() => {
                const restPackage = converterUtils.toRestPackage(newPackage);
                res.setHeader("Location", urlEncode([`/apps/${appName}/deployments/${deploymentName}`]));
                res.status(201).send({ package: restPackage });
                return invalidateCachedPackage(deploymentToRollback.key);
            });
        })
            .catch((error) => errorUtils.restErrorHandler(res, error, next))
            .done();
    });
    function invalidateCachedPackage(deploymentKey) {
        return redisManager.invalidateCache(redis.Utilities.getDeploymentKeyHash(deploymentKey));
    }
    function throwIfInvalidPermissions(app, requiredPermission) {
        const collaboratorsMap = app.collaborators;
        let isPermitted = false;
        if (collaboratorsMap) {
            for (const email of Object.keys(collaboratorsMap)) {
                if (collaboratorsMap[email].isCurrentAccount) {
                    const permission = collaboratorsMap[email].permission;
                    isPermitted = permission === storageTypes.Permissions.Owner || permission === requiredPermission;
                    break;
                }
            }
        }
        if (!isPermitted)
            throw errorUtils.restError(errorUtils.ErrorCode.Unauthorized, "This action requires " + requiredPermission + " permissions on the app!");
        return true;
    }
    function getPackageFromLabel(history, label) {
        if (!history) {
            return null;
        }
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].label === label) {
                return history[i];
            }
        }
        return null;
    }
    function getLastPackageHashWithSameAppVersion(history, appVersion) {
        if (!history || !history.length) {
            return null;
        }
        const lastPackageIndex = history.length - 1;
        if (!semver_1.default.valid(appVersion)) {
            // appVersion is a range
            const oldAppVersion = history[lastPackageIndex].appVersion;
            const oldRange = semver_1.default.validRange(oldAppVersion);
            const newRange = semver_1.default.validRange(appVersion);
            return oldRange === newRange ? history[lastPackageIndex].packageHash : null;
        }
        else {
            // appVersion is not a range
            for (let i = lastPackageIndex; i >= 0; i--) {
                if (semver_1.default.satisfies(appVersion, history[i].appVersion)) {
                    return history[i].packageHash;
                }
            }
        }
        return null;
    }
    function addDiffInfoForPackage(accountId, appId, deploymentId, appPackage, diffPackageMap) {
        let updateHistory = false;
        return storage
            .getApp(accountId, appId)
            .then((storageApp) => {
            throwIfInvalidPermissions(storageApp, storageTypes.Permissions.Collaborator);
            return storage.getPackageHistory(accountId, appId, deploymentId);
        })
            .then((history) => {
            if (history) {
                for (let i = history.length - 1; i >= 0; i--) {
                    if (history[i].label === appPackage.label && !history[i].diffPackageMap) {
                        history[i].diffPackageMap = diffPackageMap;
                        updateHistory = true;
                        break;
                    }
                }
                if (updateHistory) {
                    return storage.updatePackageHistory(accountId, appId, deploymentId, history);
                }
            }
        })
            .then(() => {
            if (updateHistory) {
                return storage.getDeployment(accountId, appId, deploymentId).then((deployment) => {
                    return invalidateCachedPackage(deployment.key);
                });
            }
        })
            .catch(diffErrorUtils.diffErrorHandler);
    }
    function processDiff(accountId, appId, deploymentId, appPackage) {
        if (!appPackage.manifestBlobUrl || process.env.ENABLE_PACKAGE_DIFFING) {
            // No need to process diff because either:
            //   1. The release just contains a single file.
            //   2. Diffing disabled.
            return (0, q_1.default)(null);
        }
        console.log(`Processing package: ${appPackage.label}`);
        return packageDiffing
            .generateDiffPackageMap(accountId, appId, deploymentId, appPackage)
            .then((diffPackageMap) => {
            console.log(`Package processed, adding diff info`);
            addDiffInfoForPackage(accountId, appId, deploymentId, appPackage, diffPackageMap);
        });
    }
    return router;
}
//# sourceMappingURL=management.js.map