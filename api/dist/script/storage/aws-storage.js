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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsStorage = void 0;
const q_1 = __importDefault(require("q"));
const shortid_1 = __importDefault(require("shortid"));
const aws_sdk_1 = require("aws-sdk");
const AWS = require("aws-sdk");
const storage = __importStar(require("./storage"));
const utils = __importStar(require("../utils/common"));
const storage_1 = require("./storage");
var Keys;
(function (Keys) {
    // Can these symbols break us?
    const DELIMITER = " ";
    const LEAF_MARKER = "*";
    function getAccountPartitionKey(accountId) {
        validateParameters(Array.prototype.slice.apply(arguments));
        return "accountId" + DELIMITER + accountId;
    }
    Keys.getAccountPartitionKey = getAccountPartitionKey;
    function getAccountAddress(accountId) {
        validateParameters(Array.prototype.slice.apply(arguments));
        return {
            partitionKeyPointer: getAccountPartitionKey(accountId),
            rowKeyPointer: getHierarchicalAccountRowKey(accountId),
        };
    }
    Keys.getAccountAddress = getAccountAddress;
    function getAppPartitionKey(appId) {
        validateParameters(Array.prototype.slice.apply(arguments));
        return "appId" + DELIMITER + appId;
    }
    Keys.getAppPartitionKey = getAppPartitionKey;
    function getHierarchicalAppRowKey(appId, deploymentId) {
        validateParameters(Array.prototype.slice.apply(arguments));
        return generateHierarchicalAppKey(/*markLeaf=*/ true, appId, deploymentId);
    }
    Keys.getHierarchicalAppRowKey = getHierarchicalAppRowKey;
    function getHierarchicalAccountRowKey(accountId, appId) {
        validateParameters(Array.prototype.slice.apply(arguments));
        return generateHierarchicalAccountKey(/*markLeaf=*/ true, accountId, appId);
    }
    Keys.getHierarchicalAccountRowKey = getHierarchicalAccountRowKey;
    function generateHierarchicalAppKey(markLeaf, appId, deploymentId) {
        validateParameters(Array.prototype.slice.apply(arguments).slice(1));
        let key = delimit("appId", appId, /*prependDelimiter=*/ false);
        if (typeof deploymentId !== "undefined") {
            key += delimit("deploymentId", deploymentId);
        }
        // Mark leaf key with a '*', e.g. 'appId 123 deploymentId 456' -> 'appId 123 deploymentId* 456'
        if (markLeaf) {
            const lastIdDelimiter = key.lastIndexOf(DELIMITER);
            key = key.substring(0, lastIdDelimiter) + LEAF_MARKER + key.substring(lastIdDelimiter);
        }
        return key;
    }
    Keys.generateHierarchicalAppKey = generateHierarchicalAppKey;
    function generateHierarchicalAccountKey(markLeaf, accountId, appId) {
        validateParameters(Array.prototype.slice.apply(arguments).slice(1));
        let key = delimit("accountId", accountId, /*prependDelimiter=*/ false);
        if (typeof appId !== "undefined") {
            key += delimit("appId", appId);
        }
        // Mark leaf key with a '*', e.g. 'accountId 123 appId 456' -> 'accountId 123 appId* 456'
        if (markLeaf) {
            const lastIdDelimiter = key.lastIndexOf(DELIMITER);
            key = key.substring(0, lastIdDelimiter) + LEAF_MARKER + key.substring(lastIdDelimiter);
        }
        return key;
    }
    Keys.generateHierarchicalAccountKey = generateHierarchicalAccountKey;
    function getAccessKeyRowKey(accountId, accessKeyId) {
        validateParameters(Array.prototype.slice.apply(arguments));
        let key = "accountId_" + accountId + "_accessKeyId*_";
        if (accessKeyId !== undefined) {
            key += accessKeyId;
        }
        return key;
    }
    Keys.getAccessKeyRowKey = getAccessKeyRowKey;
    function isDeployment(rowKey) {
        return rowKey.indexOf("deploymentId*") !== -1;
    }
    Keys.isDeployment = isDeployment;
    // To prevent a table scan when querying by properties for which we don't have partition information, we create shortcut
    // partitions which hold single entries
    function getEmailShortcutAddress(email) {
        validateParameters(Array.prototype.slice.apply(arguments));
        // We lower-case the email in our storage lookup because Partition/RowKeys are case-sensitive, but in all other cases we leave
        // the email as-is (as a new account with a different casing would be rejected as a duplicate at creation time)
        return {
            partitionKeyPointer: "email" + DELIMITER + email.toLowerCase(),
            rowKeyPointer: "EMAIL",
        };
    }
    Keys.getEmailShortcutAddress = getEmailShortcutAddress;
    function getShortcutDeploymentKeyPartitionKey(deploymentKey) {
        validateParameters(Array.prototype.slice.apply(arguments));
        return delimit("deploymentKey", deploymentKey, /*prependDelimiter=*/ false);
    }
    Keys.getShortcutDeploymentKeyPartitionKey = getShortcutDeploymentKeyPartitionKey;
    function getShortcutDeploymentKeyRowKey() {
        return "DeploymentKeyRowKey";
    }
    Keys.getShortcutDeploymentKeyRowKey = getShortcutDeploymentKeyRowKey;
    function getShortcutAccessKeyPartitionKey(accessKeyName, hash = true) {
        validateParameters(Array.prototype.slice.apply(arguments));
        return delimit("accessKey", hash ? utils.hashWithSHA256(accessKeyName) : accessKeyName, /*prependDelimiter=*/ false);
    }
    Keys.getShortcutAccessKeyPartitionKey = getShortcutAccessKeyPartitionKey;
    // Last layer of defense against uncaught injection attacks - raise an uncaught exception
    function validateParameters(parameters) {
        parameters.forEach((parameter) => {
            if (parameter && (parameter.indexOf(DELIMITER) >= 0 || parameter.indexOf(LEAF_MARKER) >= 0)) {
                throw storage.storageError(storage.ErrorCode.Invalid, `The parameter '${parameter}' contained invalid characters.`);
            }
        });
    }
    function delimit(fieldName, value, prependDelimiter = true) {
        const prefix = prependDelimiter ? DELIMITER : "";
        return prefix + fieldName + DELIMITER + value;
    }
})(Keys || (Keys = {}));
class AwsStorage {
    constructor(accountName, accountKey) {
        shortid_1.default.characters("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-");
        this._setupPromise = this.setup();
    }
    reinitialize(accountName, accountKey) {
        console.log("Re-initializing Azure storage");
        return this.setup();
    }
    checkHealth() {
        return q_1.default.Promise((resolve, reject) => {
            this._setupPromise
                .then(() => {
                // Check DynamoDB health
                const tableCheck = q_1.default.Promise((tableResolve, tableReject) => {
                    const params = {
                        TableName: AwsStorage.TABLE_NAME,
                        Key: {
                            partitionKey: "health",
                            rowKey: "health",
                        },
                    };
                    this._dynamoDBClient
                        .get(params)
                        .promise()
                        .then((result) => {
                        if (!result.Item || result.Item.health !== "health") {
                            tableReject(storage.storageError(storage.ErrorCode.ConnectionFailed, "The DynamoDB service failed the health check"));
                        }
                        else {
                            tableResolve();
                        }
                    })
                        .catch(tableReject);
                });
                // Check S3 bucket health
                const acquisitionBucketCheck = q_1.default.Promise((bucketResolve, bucketReject) => {
                    const params = {
                        Bucket: AwsStorage.TABLE_NAME,
                        Key: "health",
                    };
                    this._s3Client
                        .headObject(params)
                        .promise()
                        .then(() => bucketResolve())
                        .catch((error) => {
                        bucketReject(storage.storageError(storage.ErrorCode.ConnectionFailed, `The S3 service failed the health check for ${AwsStorage.TABLE_NAME}: ${error.message}`));
                    });
                });
                const historyBucketCheck = q_1.default.Promise((bucketResolve, bucketReject) => {
                    const params = {
                        Bucket: AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME,
                        Key: `${AwsStorage.PACKAGE_HISTORY_S3_PREFIX}/health`,
                    };
                    this._s3Client
                        .headObject(params)
                        .promise()
                        .then(() => bucketResolve())
                        .catch((error) => {
                        bucketReject(storage.storageError(storage.ErrorCode.ConnectionFailed, `The S3 service failed the health check for ${AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME}: ${error.message}`));
                    });
                });
                return q_1.default.all([tableCheck, acquisitionBucketCheck, historyBucketCheck]);
            })
                .then(() => {
                resolve();
            })
                .catch(reject);
        });
    }
    addAccount(account) {
        account = storage.clone(account); // pass by value
        account.id = "g24x7"; //shortid.generate();
        const hierarchicalAddress = Keys.getAccountAddress(account.id);
        const emailShortcutAddress = Keys.getEmailShortcutAddress(account.email);
        // Store the actual Account in the email partition, and a Pointer in the other partitions
        const accountPointer = Keys.getEmailShortcutAddress(account.email);
        return this._setupPromise
            .then(() => {
            const entity = this.wrap(account, emailShortcutAddress.partitionKeyPointer, emailShortcutAddress.rowKeyPointer);
            const params = {
                TableName: AwsStorage.TABLE_NAME,
                Item: entity,
            };
            return this._dynamoDBClient.put(params).promise();
        })
            .then(() => {
            const entity = this.wrap(accountPointer, hierarchicalAddress.partitionKeyPointer, hierarchicalAddress.rowKeyPointer);
            const params = {
                TableName: AwsStorage.TABLE_NAME,
                Item: entity,
            };
            return this._dynamoDBClient.put(params).promise();
        })
            .then(() => {
            return account.id;
        })
            .catch((error) => {
            console.error("AWS DynamoDB Error:", error);
            throw error;
        });
    }
    getAccount(accountId) {
        const address = Keys.getAccountAddress(accountId);
        return this._setupPromise
            .then(() => {
            return this.retrieveByKey(address.partitionKeyPointer, address.rowKeyPointer);
        })
            .then((pointer) => {
            return this.retrieveByKey(pointer.partitionKeyPointer, pointer.rowKeyPointer);
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    getAccountByEmail(email) {
        const address = Keys.getEmailShortcutAddress(email);
        return this._setupPromise
            .then(() => {
            return this.retrieveByKey(address.partitionKeyPointer, address.rowKeyPointer);
        })
            .catch((azureError) => {
            AwsStorage.awsErrorHandler(azureError, true, "ResourceNotFound", "The specified e-mail address doesn't represent a registered user");
        });
    }
    updateAccount(email, updateProperties) {
        if (!email)
            throw new Error("No account email");
        const address = Keys.getEmailShortcutAddress(email);
        const updateExpression = "set azureAdId = :azureAdId, gitHubId = :gitHubId, microsoftId = :microsoftId";
        const expressionValues = {
            ":azureAdId": updateProperties.azureAdId,
            ":gitHubId": updateProperties.gitHubId,
            ":microsoftId": updateProperties.microsoftId,
        };
        const params = {
            TableName: AwsStorage.TABLE_NAME,
            Key: {
                partitionKey: address.partitionKeyPointer,
                rowKey: address.rowKeyPointer,
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionValues,
        };
        return this._setupPromise.then(() => this._dynamoDBClient.update(params).promise()).catch(AwsStorage.awsErrorHandler);
    }
    getAccountIdFromAccessKey(accessKey) {
        const partitionKey = Keys.getShortcutAccessKeyPartitionKey(accessKey);
        const rowKey = "";
        return this._setupPromise
            .then(() => {
            return this.retrieveByKey(partitionKey, rowKey);
        })
            .then((accountIdObject) => {
            if (new Date().getTime() >= accountIdObject.expires) {
                throw storage.storageError(storage.ErrorCode.Expired, "The access key has expired.");
            }
            return accountIdObject.accountId;
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    addApp(accountId, app) {
        app = storage.clone(app); // pass by value
        app.id = shortid_1.default.generate();
        return this._setupPromise
            .then(() => {
            return this.getAccount(accountId);
        })
            .then((account) => {
            const collabMap = {};
            collabMap[account.email] = { accountId: accountId, permission: storage.Permissions.Owner };
            app.collaborators = collabMap;
            const flatApp = AwsStorage.flattenApp(app, /*updateCollaborator*/ true);
            return this.insertByAppHierarchy(flatApp, app.id);
        })
            .then(() => {
            return this.addAppPointer(accountId, app.id);
        })
            .then(() => {
            return app;
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    getApps(accountId) {
        return this._setupPromise
            .then(() => {
            return this.getCollectionByHierarchy(accountId);
        })
            .then((flatApps) => {
            const apps = flatApps.map((flatApp) => {
                return AwsStorage.unflattenApp(flatApp, accountId);
            });
            return apps;
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    getApp(accountId, appId, keepCollaboratorIds = false) {
        return this._setupPromise
            .then(() => {
            return this.retrieveByAppHierarchy(appId);
        })
            .then((flatApp) => {
            return AwsStorage.unflattenApp(flatApp, accountId);
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    removeApp(accountId, appId) {
        // remove entries for all collaborators account before removing the app
        return this._setupPromise
            .then(() => {
            return this.removeAllCollaboratorsAppPointers(accountId, appId);
        })
            .then(() => {
            return this.cleanUpByAppHierarchy(appId);
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    updateApp(accountId, app) {
        const appId = app.id;
        if (!appId)
            throw new Error("No app id");
        return this._setupPromise
            .then(() => {
            return this.updateAppWithPermission(accountId, app, /*updateCollaborator*/ false);
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    transferApp(accountId, appId, email) {
        let app;
        let targetCollaboratorAccountId;
        let requestingCollaboratorEmail;
        let isTargetAlreadyCollaborator;
        return this._setupPromise
            .then(() => {
            const getAppPromise = this.getApp(accountId, appId, /*keepCollaboratorIds*/ true);
            const accountPromise = this.getAccountByEmail(email);
            return q_1.default.all([getAppPromise, accountPromise]);
        })
            .spread((appPromiseResult, accountPromiseResult) => {
            targetCollaboratorAccountId = accountPromiseResult.id;
            email = accountPromiseResult.email; // Use the original email stored on the account to ensure casing is consistent
            app = appPromiseResult;
            requestingCollaboratorEmail = AwsStorage.getEmailForAccountId(app.collaborators, accountId);
            if (requestingCollaboratorEmail === email) {
                throw storage.storageError(storage.ErrorCode.AlreadyExists, "The given account already owns the app.");
            }
            return this.getApps(targetCollaboratorAccountId);
        })
            .then((appsForCollaborator) => {
            if (storage.NameResolver.isDuplicate(appsForCollaborator, app.name)) {
                throw storage.storageError(storage.ErrorCode.AlreadyExists, 'Cannot transfer ownership. An app with name "' + app.name + '" already exists for the given collaborator.');
            }
            isTargetAlreadyCollaborator = AwsStorage.isCollaborator(app.collaborators, email);
            // Update the current owner to be a collaborator
            AwsStorage.setCollaboratorPermission(app.collaborators, requestingCollaboratorEmail, storage.Permissions.Collaborator);
            // set target collaborator as an owner.
            if (isTargetAlreadyCollaborator) {
                AwsStorage.setCollaboratorPermission(app.collaborators, email, storage.Permissions.Owner);
            }
            else {
                const targetOwnerProperties = {
                    accountId: targetCollaboratorAccountId,
                    permission: storage.Permissions.Owner,
                };
                AwsStorage.addToCollaborators(app.collaborators, email, targetOwnerProperties);
            }
            return this.updateAppWithPermission(accountId, app, /*updateCollaborator*/ true);
        })
            .then(() => {
            if (!isTargetAlreadyCollaborator) {
                // Added a new collaborator as owner to the app, create a corresponding entry for app in target collaborator's account.
                return this.addAppPointer(targetCollaboratorAccountId, app.id);
            }
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    addCollaborator(accountId, appId, email) {
        return this._setupPromise
            .then(() => {
            const getAppPromise = this.getApp(accountId, appId, /*keepCollaboratorIds*/ true);
            const accountPromise = this.getAccountByEmail(email);
            return q_1.default.all([getAppPromise, accountPromise]);
        })
            .spread((app, account) => {
            // Use the original email stored on the account to ensure casing is consistent
            email = account.email;
            return this.addCollaboratorWithPermissions(accountId, app, email, {
                accountId: account.id,
                permission: storage.Permissions.Collaborator,
            });
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    getCollaborators(accountId, appId) {
        return this._setupPromise
            .then(() => {
            return this.getApp(accountId, appId, /*keepCollaboratorIds*/ false);
        })
            .then((app) => {
            return (0, q_1.default)(app.collaborators);
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    removeCollaborator(accountId, appId, email) {
        return this._setupPromise
            .then(() => {
            return this.getApp(accountId, appId, /*keepCollaboratorIds*/ true);
        })
            .then((app) => {
            const removedCollabProperties = app.collaborators[email];
            if (!removedCollabProperties) {
                throw storage.storageError(storage.ErrorCode.NotFound, "The given email is not a collaborator for this app.");
            }
            if (!AwsStorage.isOwner(app.collaborators, email)) {
                delete app.collaborators[email];
            }
            else {
                throw storage.storageError(storage.ErrorCode.AlreadyExists, "Cannot remove the owner of the app from collaborator list.");
            }
            return this.updateAppWithPermission(accountId, app, /*updateCollaborator*/ true).then(() => {
                return this.removeAppPointer(removedCollabProperties.accountId, app.id);
            });
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    addDeployment(accountId, appId, deployment) {
        let deploymentId;
        return this._setupPromise
            .then(() => {
            const flatDeployment = AwsStorage.flattenDeployment(deployment);
            flatDeployment.id = shortid_1.default.generate();
            return this.insertByAppHierarchy(flatDeployment, appId, flatDeployment.id);
        })
            .then((returnedId) => {
            deploymentId = returnedId;
            // Upload empty history array to S3
            const params = {
                Bucket: AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME,
                Key: `${AwsStorage.PACKAGE_HISTORY_S3_PREFIX}/${deploymentId}`,
                Body: JSON.stringify([]),
                ContentType: "application/json",
            };
            return q_1.default.Promise((resolve, reject) => {
                this._s3Client
                    .putObject(params)
                    .promise()
                    .then(() => resolve())
                    .catch(reject);
            });
        })
            .then(() => {
            const shortcutPartitionKey = Keys.getShortcutDeploymentKeyPartitionKey(deployment.key);
            const shortcutRowKey = Keys.getShortcutDeploymentKeyRowKey();
            const pointer = {
                appId: appId,
                deploymentId: deploymentId,
            };
            const entity = this.wrap(pointer, shortcutPartitionKey, shortcutRowKey);
            // Store pointer in DynamoDB
            const params = {
                TableName: AwsStorage.TABLE_NAME,
                Item: entity,
                ConditionExpression: "attribute_not_exists(partitionKey) AND attribute_not_exists(rowKey)",
            };
            return q_1.default.Promise((resolve, reject) => {
                this._dynamoDBClient
                    .put(params)
                    .promise()
                    .then(() => resolve())
                    .catch(reject);
            });
        })
            .then(() => {
            return deploymentId;
        })
            .catch((error) => {
            // Handle specific AWS errors
            if (error.code === "ConditionalCheckFailedException") {
                throw storage.storageError(storage.ErrorCode.AlreadyExists, "Deployment already exists");
            }
            return AwsStorage.awsErrorHandler(error);
        });
    }
    getDeploymentInfo(deploymentKey) {
        const partitionKey = Keys.getShortcutDeploymentKeyPartitionKey(deploymentKey);
        const rowKey = Keys.getShortcutDeploymentKeyRowKey();
        return this._setupPromise
            .then(() => {
            return this.retrieveByKey(partitionKey, rowKey);
        })
            .then((pointer) => {
            if (!pointer) {
                return null;
            }
            return { appId: pointer.appId, deploymentId: pointer.deploymentId };
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    getPackageHistoryFromDeploymentKey(deploymentKey) {
        const pointerPartitionKey = Keys.getShortcutDeploymentKeyPartitionKey(deploymentKey);
        const pointerRowKey = Keys.getShortcutDeploymentKeyRowKey();
        return this._setupPromise
            .then(() => {
            return this.retrieveByKey(pointerPartitionKey, pointerRowKey);
        })
            .then((pointer) => {
            if (!pointer)
                return null;
            return this.getPackageHistoryFromBlob(pointer.deploymentId);
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    getDeployment(accountId, appId, deploymentId) {
        return this._setupPromise
            .then(() => {
            return this.retrieveByAppHierarchy(appId, deploymentId);
        })
            .then((flatDeployment) => {
            return AwsStorage.unflattenDeployment(flatDeployment);
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    getDeployments(accountId, appId) {
        return this._setupPromise
            .then(() => {
            return this.getCollectionByHierarchy(accountId, appId);
        })
            .then((flatDeployments) => {
            const deployments = [];
            flatDeployments.forEach((flatDeployment) => {
                deployments.push(AwsStorage.unflattenDeployment(flatDeployment));
            });
            return deployments;
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    removeDeployment(accountId, appId, deploymentId) {
        return this._setupPromise
            .then(() => {
            return this.cleanUpByAppHierarchy(appId, deploymentId);
        })
            .then(() => {
            return this.deleteHistoryBlob(deploymentId);
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    updateDeployment(accountId, appId, deployment) {
        const deploymentId = deployment.id;
        if (!deploymentId)
            throw new Error("No deployment id");
        return this._setupPromise
            .then(() => {
            const flatDeployment = AwsStorage.flattenDeployment(deployment);
            return this.mergeByAppHierarchy(flatDeployment, appId, deploymentId);
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    commitPackage(accountId, appId, deploymentId, appPackage) {
        if (!deploymentId)
            throw new Error("No deployment id");
        if (!appPackage)
            throw new Error("No package specified");
        appPackage = storage.clone(appPackage); // pass by value
        let packageHistory;
        return this._setupPromise
            .then(() => {
            return this.getPackageHistoryFromBlob(deploymentId);
        })
            .then((history) => {
            packageHistory = history;
            appPackage.label = this.getNextLabel(packageHistory);
            return this.getAccount(accountId);
        })
            .then((account) => {
            appPackage.releasedBy = account.email;
            // Remove the rollout value for the last package.
            const lastPackage = packageHistory && packageHistory.length ? packageHistory[packageHistory.length - 1] : null;
            if (lastPackage) {
                lastPackage.rollout = null;
            }
            packageHistory.push(appPackage);
            if (packageHistory.length > AwsStorage.MAX_PACKAGE_HISTORY_LENGTH) {
                packageHistory.splice(0, packageHistory.length - AwsStorage.MAX_PACKAGE_HISTORY_LENGTH);
            }
            const flatPackage = { id: deploymentId, package: JSON.stringify(appPackage) };
            return this.mergeByAppHierarchy(flatPackage, appId, deploymentId);
        })
            .then(() => {
            return this.uploadToHistoryBlob(deploymentId, JSON.stringify(packageHistory));
        })
            .then(() => {
            return appPackage;
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    clearPackageHistory(accountId, appId, deploymentId) {
        return this._setupPromise
            .then(() => {
            return this.retrieveByAppHierarchy(appId, deploymentId);
        })
            .then((flatDeployment) => {
            delete flatDeployment.package;
            return this.updateByAppHierarchy(flatDeployment, appId, deploymentId);
        })
            .then(() => {
            return this.uploadToHistoryBlob(deploymentId, JSON.stringify([]));
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    getPackageHistory(accountId, appId, deploymentId) {
        return this._setupPromise
            .then(() => {
            return this.getPackageHistoryFromBlob(deploymentId);
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    updatePackageHistory(accountId, appId, deploymentId, history) {
        // If history is null or empty array we do not update the package history, use clearPackageHistory for that.
        if (!history || !history.length) {
            throw storage.storageError(storage.ErrorCode.Invalid, "Cannot clear package history from an update operation");
        }
        return this._setupPromise
            .then(() => {
            const flatDeployment = { id: deploymentId, package: JSON.stringify(history[history.length - 1]) };
            return this.mergeByAppHierarchy(flatDeployment, appId, deploymentId);
        })
            .then(() => {
            return this.uploadToHistoryBlob(deploymentId, JSON.stringify(history));
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    addBlob(blobId, stream, streamLength) {
        return this._setupPromise
            .then(() => {
            return utils.streamToBuffer(stream);
        })
            .then((buffer) => {
            const params = {
                Bucket: AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_BUCKET_NAME,
                Key: `${AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_PREFIX}/${blobId}`,
                Body: Buffer.from(buffer),
                ContentLength: streamLength,
                ContentType: "application/octet-stream",
            };
            return q_1.default.Promise((resolve, reject) => {
                this._s3Client
                    .putObject(params)
                    .promise()
                    .then(() => resolve())
                    .catch((error) => {
                    if (error.code === "NoSuchBucket") {
                        reject(storage.storageError(storage.ErrorCode.NotFound, `Bucket ${AwsStorage.TABLE_NAME} not found`));
                    }
                    else {
                        reject(error);
                    }
                });
            });
        })
            .then(() => {
            return q_1.default.Promise((resolve, reject) => {
                resolve(`${AwsStorage.PACKAGE_DOWNLOAD_CDN_URL}/${AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_PREFIX}/${blobId}`);
            });
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    getBlobUrl(blobId) {
        return this._setupPromise
            .then(() => {
            return q_1.default.Promise((resolve, reject) => {
                const params = {
                    Bucket: AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_BUCKET_NAME,
                    Key: `${AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_PREFIX}/${blobId}`,
                };
                this._s3Client
                    .getSignedUrlPromise("getObject", params)
                    .then((url) => {
                    if (!url) {
                        reject(storage.storageError(storage.ErrorCode.NotFound, "Failed to generate signed URL"));
                    }
                    resolve(url);
                })
                    .catch((error) => {
                    if (error.code === "NoSuchKey") {
                        reject(storage.storageError(storage.ErrorCode.NotFound, `Blob ${blobId} not found`));
                    }
                    reject(error);
                });
            });
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    removeBlob(blobId) {
        return this._setupPromise
            .then(() => {
            return q_1.default.Promise((resolve, reject) => {
                const params = {
                    Bucket: AwsStorage.TABLE_NAME,
                    Key: blobId,
                };
                // First check if object exists
                this._s3Client
                    .headObject(params)
                    .promise()
                    .then(() => {
                    // Object exists, proceed with deletion
                    return this._s3Client.deleteObject(params).promise();
                })
                    .then(() => {
                    resolve();
                })
                    .catch((error) => {
                    if (error.code === "NotFound" || error.code === "NoSuchKey") {
                        reject(storage.storageError(storage.ErrorCode.NotFound, `Blob ${blobId} not found`));
                    }
                    else {
                        reject(error);
                    }
                });
            });
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    addAccessKey(accountId, accessKey) {
        accessKey = storage.clone(accessKey); // pass by value
        accessKey.id = shortid_1.default.generate();
        return this._setupPromise
            .then(() => {
            // Store access key pointer
            const partitionKey = Keys.getShortcutAccessKeyPartitionKey(accessKey.name);
            const rowKey = "";
            const accessKeyPointer = {
                accountId,
                expires: accessKey.expires,
            };
            const params = {
                TableName: AwsStorage.TABLE_NAME,
                Item: this.wrap(accessKeyPointer, partitionKey, rowKey),
                ConditionExpression: "attribute_not_exists(partitionKey) AND attribute_not_exists(rowKey)",
            };
            return q_1.default.Promise((resolve, reject) => {
                this._dynamoDBClient
                    .put(params)
                    .promise()
                    .then(() => resolve())
                    .catch((error) => {
                    if (error.code === "ConditionalCheckFailedException") {
                        reject(new Error("Access key name already exists"));
                    }
                    else {
                        reject(error);
                    }
                });
            });
        })
            .then(() => {
            // Store actual access key
            return this.insertAccessKey(accessKey, accountId);
        })
            .then(() => {
            return accessKey.id;
        })
            .catch((error) => {
            // Clean up pointer if second operation fails
            if (error.code !== "ConditionalCheckFailedException") {
                const deleteParams = {
                    TableName: AwsStorage.TABLE_NAME,
                    Key: {
                        partitionKey: Keys.getShortcutAccessKeyPartitionKey(accessKey.name),
                        rowKey: "",
                    },
                };
                this._dynamoDBClient
                    .delete(deleteParams)
                    .promise()
                    .catch(() => { }); // Ignore cleanup errors
            }
            return AwsStorage.awsErrorHandler(error);
        });
    }
    getAccessKey(accountId, accessKeyId) {
        const partitionKey = Keys.getAccountPartitionKey(accountId);
        const rowKey = Keys.getAccessKeyRowKey(accountId, accessKeyId);
        return this._setupPromise
            .then(() => {
            return this.retrieveByKey(partitionKey, rowKey);
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    getAccessKeys(accountId) {
        const deferred = q_1.default.defer();
        const partitionKey = Keys.getAccountPartitionKey(accountId);
        const rowKey = Keys.getHierarchicalAccountRowKey(accountId);
        const searchKey = Keys.getAccessKeyRowKey(accountId);
        const params = {
            TableName: AwsStorage.TABLE_NAME,
            KeyConditionExpression: "partitionKey = :pk and rowKey BETWEEN :start AND :end",
            ExpressionAttributeValues: {
                ":pk": partitionKey,
                ":start": searchKey,
                ":end": searchKey + "~",
            },
        };
        // First check if account exists
        const accountCheckParams = {
            TableName: AwsStorage.TABLE_NAME,
            Key: {
                partitionKey: partitionKey,
                rowKey: rowKey,
            },
        };
        this._setupPromise
            .then(() => {
            return this._dynamoDBClient.get(accountCheckParams).promise();
        })
            .then((result) => {
            if (!result.Item) {
                throw storage.storageError(storage.ErrorCode.NotFound, "Account not found");
            }
            return this._dynamoDBClient.query(params).promise();
        })
            .then((result) => __awaiter(this, void 0, void 0, function* () {
            let items = result.Items || [];
            let lastEvaluatedKey = result.LastEvaluatedKey;
            // Handle pagination if needed
            while (lastEvaluatedKey) {
                const nextParams = Object.assign(Object.assign({}, params), { ExclusiveStartKey: lastEvaluatedKey });
                const nextResult = yield this._dynamoDBClient.query(nextParams).promise();
                items = items.concat(nextResult.Items || []);
                lastEvaluatedKey = nextResult.LastEvaluatedKey;
            }
            const accessKeys = items
                .filter((item) => item.rowKey !== rowKey) // Don't include the account
                .map((item) => this.unwrap(item));
            deferred.resolve(accessKeys);
        }))
            .catch((error) => {
            if (error.code === "ResourceNotFoundException") {
                deferred.reject(storage.storageError(storage.ErrorCode.NotFound, "Table not found"));
            }
            else {
                deferred.reject(AwsStorage.awsErrorHandler(error));
            }
        });
        return deferred.promise;
    }
    removeAccessKey(accountId, accessKeyId) {
        return this._setupPromise
            .then(() => {
            return this.getAccessKey(accountId, accessKeyId);
        })
            .then((accessKey) => {
            const mainDeleteParams = {
                TableName: AwsStorage.TABLE_NAME,
                Key: {
                    partitionKey: Keys.getAccountPartitionKey(accountId),
                    rowKey: Keys.getAccessKeyRowKey(accountId, accessKeyId),
                },
                ConditionExpression: "attribute_exists(partitionKey) AND attribute_exists(rowKey)",
            };
            const shortcutDeleteParams = {
                TableName: AwsStorage.TABLE_NAME,
                Key: {
                    partitionKey: Keys.getShortcutAccessKeyPartitionKey(accessKey.name, false),
                    rowKey: "",
                },
                ConditionExpression: "attribute_exists(partitionKey) AND attribute_exists(rowKey)",
            };
            return q_1.default.all([
                q_1.default.Promise((resolve, reject) => {
                    this._dynamoDBClient
                        .delete(mainDeleteParams)
                        .promise()
                        .then(() => resolve())
                        .catch((error) => {
                        if (error.code === "ConditionalCheckFailedException") {
                            reject(storage.storageError(storage.ErrorCode.NotFound, "Access key not found"));
                        }
                        reject(error);
                    });
                }),
                q_1.default.Promise((resolve, reject) => {
                    this._dynamoDBClient
                        .delete(shortcutDeleteParams)
                        .promise()
                        .then(() => resolve())
                        .catch((error) => {
                        if (error.code === "ConditionalCheckFailedException") {
                            // Ignore if shortcut doesn't exist
                            resolve();
                        }
                        reject(error);
                    });
                }),
            ]);
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    updateAccessKey(accountId, accessKey) {
        if (!accessKey) {
            throw new Error("No access key");
        }
        if (!accessKey.id) {
            throw new Error("No access key id");
        }
        const partitionKey = Keys.getAccountPartitionKey(accountId);
        const rowKey = Keys.getAccessKeyRowKey(accountId, accessKey.id);
        return this._setupPromise
            .then(() => {
            // Main access key update
            const mainUpdateFields = Object.entries(accessKey)
                .filter(([key]) => !["partitionKey", "rowKey"].includes(key))
                .reduce((acc, [key, value], index) => {
                acc.expressions.push(`#field${index} = :value${index}`);
                acc.names[`#field${index}`] = key;
                acc.values[`:value${index}`] = value;
                return acc;
            }, {
                expressions: [],
                names: {},
                values: {},
            });
            const mainUpdateParams = {
                TableName: AwsStorage.TABLE_NAME,
                Key: {
                    partitionKey,
                    rowKey,
                },
                UpdateExpression: `SET ${mainUpdateFields.expressions.join(", ")}`,
                ExpressionAttributeNames: mainUpdateFields.names,
                ExpressionAttributeValues: mainUpdateFields.values,
                ConditionExpression: "attribute_exists(partitionKey) AND attribute_exists(rowKey)",
            };
            return q_1.default.Promise((resolve, reject) => {
                this._dynamoDBClient
                    .update(mainUpdateParams)
                    .promise()
                    .then(() => resolve())
                    .catch((error) => {
                    if (error.code === "ConditionalCheckFailedException") {
                        reject(storage.storageError(storage.ErrorCode.NotFound, "Access key not found"));
                    }
                    reject(error);
                });
            });
        })
            .then(() => {
            // Pointer update
            const pointerUpdateParams = {
                TableName: AwsStorage.TABLE_NAME,
                Key: {
                    partitionKey: Keys.getShortcutAccessKeyPartitionKey(accessKey.name, false),
                    rowKey: "",
                },
                UpdateExpression: "SET #accountId = :accountId, #expires = :expires",
                ExpressionAttributeNames: {
                    "#accountId": "accountId",
                    "#expires": "expires",
                },
                ExpressionAttributeValues: {
                    ":accountId": accountId,
                    ":expires": accessKey.expires,
                },
                ConditionExpression: "attribute_exists(partitionKey) AND attribute_exists(rowKey)",
            };
            return q_1.default.Promise((resolve, reject) => {
                this._dynamoDBClient
                    .update(pointerUpdateParams)
                    .promise()
                    .then(() => resolve())
                    .catch((error) => {
                    if (error.code === "ConditionalCheckFailedException") {
                        reject(storage.storageError(storage.ErrorCode.NotFound, "Access key pointer not found"));
                    }
                    reject(error);
                });
            });
        })
            .catch(AwsStorage.awsErrorHandler);
    }
    // No-op for safety, so that we don't drop the wrong db, pending a cleaner solution for removing test data.
    dropAll() {
        return (0, q_1.default)(null);
    }
    setup() {
        console.log("\n=== AWS Configuration ===");
        console.log("DynamoDB Table:", AwsStorage.TABLE_NAME);
        console.log("Package History Bucket:", AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME);
        console.log("Package Download Bucket:", AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_BUCKET_NAME);
        console.log("CDN URL:", AwsStorage.PACKAGE_DOWNLOAD_CDN_URL);
        console.log("AWS Region:", process.env.AWS_REGION);
        console.log("Environment:", process.env.NODE_ENV);
        console.log("=====================\n");
        return q_1.default.Promise((resolve, reject) => {
            try {
                // Initialize AWS clients
                const awsConfig = {
                    region: process.env.AWS_REGION,
                };
                //TODO:  Only add credentials in local development or remove this
                // code and add in readme file for folks to run this locally
                if (process.env.NODE_ENV === "development") {
                    console.log("🔑 Using local AWS credentials");
                    awsConfig.credentials = new AWS.SharedIniFileCredentials({
                        profile: "default",
                    });
                }
                else {
                    console.log("🔒 Using IAM role credentials");
                }
                AWS.config.update(awsConfig);
                this._dynamoDBClient = new aws_sdk_1.DynamoDB.DocumentClient();
                this._s3Client = new aws_sdk_1.S3();
                // Test DynamoDB connection
                const params = {
                    TableName: AwsStorage.TABLE_NAME,
                    Key: {
                        partitionKey: "health",
                        rowKey: "health",
                    },
                };
                this._dynamoDBClient
                    .get(params)
                    .promise()
                    .then(() => {
                    console.log("✅ Successfully connected to DynamoDB");
                    resolve();
                })
                    .catch((error) => {
                    console.error("❌ Failed to connect to DynamoDB:", error.message);
                    reject(error);
                });
            }
            catch (error) {
                console.error("❌ Failed to initialize AWS clients:", error.message);
                reject(error);
            }
        });
    }
    blobHealthCheck(blobId) {
        return q_1.default.Promise((resolve, reject) => {
            const params = {
                Bucket: blobId,
                Key: "health",
            };
            this._s3Client
                .getObject(params)
                .promise()
                .then((response) => {
                if (!response.Body) {
                    throw new Error("Health check object is empty");
                }
                const content = response.Body.toString();
                if (content !== "health") {
                    throw storage.storageError(storage.ErrorCode.ConnectionFailed, `The S3 service failed the health check for ${blobId}: invalid content`);
                }
                resolve();
            })
                .catch((error) => {
                if (error.code === "NoSuchBucket") {
                    reject(storage.storageError(storage.ErrorCode.ConnectionFailed, `The S3 bucket ${blobId} does not exist`));
                }
                else if (error.code === "NoSuchKey") {
                    reject(storage.storageError(storage.ErrorCode.ConnectionFailed, `Health check object not found in bucket ${blobId}`));
                }
                else {
                    reject(storage.storageError(storage.ErrorCode.ConnectionFailed, `The S3 service failed the health check for ${blobId}: ${error.message}`));
                }
            });
        });
    }
    getPackageHistoryFromBlob(deploymentId) {
        return q_1.default.Promise((resolve, reject) => {
            const params = {
                Bucket: AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME,
                Key: `${AwsStorage.PACKAGE_HISTORY_S3_PREFIX}/${deploymentId}`,
            };
            this._s3Client
                .getObject(params)
                .promise()
                .then((response) => {
                if (!response.Body) {
                    throw new Error("Health check object is empty");
                }
                try {
                    const content = response.Body.toString("utf-8");
                    const parsedContents = JSON.parse(content);
                    resolve(parsedContents);
                }
                catch (parseError) {
                    reject(storage.storageError(storage.ErrorCode.Invalid, `Failed to parse package history: ${parseError.message}`));
                }
            })
                .catch((error) => {
                if (error.code === "NoSuchKey") {
                    reject(storage.storageError(storage.ErrorCode.NotFound, `Package history not found for ID: ${deploymentId}`));
                }
                else {
                    reject(AwsStorage.awsErrorHandler(error));
                }
            });
        });
    }
    uploadToHistoryBlob(deploymentId, content) {
        return q_1.default.Promise((resolve, reject) => {
            const params = {
                Bucket: AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME,
                Key: `${AwsStorage.PACKAGE_HISTORY_S3_PREFIX}/${deploymentId}`,
                Body: content,
                ContentType: "application/json",
                ContentLength: Buffer.from(content).length,
            };
            this._s3Client
                .putObject(params)
                .promise()
                .then(() => resolve())
                .catch((error) => {
                if (error.code === "NoSuchBucket") {
                    reject(storage.storageError(storage.ErrorCode.NotFound, `History bucket ${AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME} not found`));
                }
                else {
                    reject(AwsStorage.awsErrorHandler(error));
                }
            });
        });
    }
    deleteHistoryBlob(deploymentId) {
        return q_1.default.Promise((resolve, reject) => {
            const params = {
                Bucket: AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME,
                Key: `${AwsStorage.PACKAGE_HISTORY_S3_PREFIX}/${deploymentId}`,
            };
            // First check if object exists
            this._s3Client
                .headObject(params)
                .promise()
                .then(() => {
                return this._s3Client.deleteObject(params).promise();
            })
                .then(() => resolve())
                .catch((error) => {
                if (error.code === "NotFound" || error.code === "NoSuchKey") {
                    reject(storage.storageError(storage.ErrorCode.NotFound, `History blob ${deploymentId} not found`));
                }
                else {
                    reject(AwsStorage.awsErrorHandler(error));
                }
            });
        });
    }
    wrap(jsObject, partitionKey, rowKey) {
        return Object.assign({ partitionKey,
            rowKey }, jsObject);
    }
    unwrap(entity, includeKey) {
        const { partitionKey, rowKey, etag, timestamp, createdTime } = entity, rest = __rest(entity, ["partitionKey", "rowKey", "etag", "timestamp", "createdTime"]);
        let unwrapped = includeKey ? Object.assign({ partitionKey, rowKey }, rest) : rest;
        if (typeof createdTime === "bigint") {
            unwrapped = Object.assign(Object.assign({}, unwrapped), { createdTime: Number(createdTime) });
        }
        return unwrapped;
    }
    addCollaboratorWithPermissions(accountId, app, email, collabProperties) {
        if (app && app.collaborators && !app.collaborators[email]) {
            app.collaborators[email] = collabProperties;
            return this.updateAppWithPermission(accountId, app, /*updateCollaborator*/ true).then(() => {
                return this.addAppPointer(collabProperties.accountId, app.id);
            });
        }
        else {
            throw storage.storageError(storage.ErrorCode.AlreadyExists, "The given account is already a collaborator for this app.");
        }
    }
    addAppPointer(accountId, appId) {
        const deferred = q_1.default.defer();
        const appPartitionKey = Keys.getAppPartitionKey(appId);
        const appRowKey = Keys.getHierarchicalAppRowKey(appId);
        const pointer = { partitionKeyPointer: appPartitionKey, rowKeyPointer: appRowKey };
        const accountPartitionKey = Keys.getAccountPartitionKey(accountId);
        const accountRowKey = Keys.getHierarchicalAccountRowKey(accountId, appId);
        const entity = this.wrap(pointer, accountPartitionKey, accountRowKey);
        const params = {
            TableName: AwsStorage.TABLE_NAME,
            Item: entity,
            ConditionExpression: "attribute_not_exists(partitionKey) AND attribute_not_exists(rowKey)",
        };
        this._dynamoDBClient
            .put(params)
            .promise()
            .then(() => {
            deferred.resolve();
        })
            .catch((error) => {
            if (error.code === "ConditionalCheckFailedException") {
                deferred.reject(new Error("App pointer already exists"));
            }
            else {
                deferred.reject(error);
            }
        });
        return deferred.promise;
    }
    removeAppPointer(accountId, appId) {
        const deferred = q_1.default.defer();
        const accountPartitionKey = Keys.getAccountPartitionKey(accountId);
        const accountRowKey = Keys.getHierarchicalAccountRowKey(accountId, appId);
        const params = {
            TableName: AwsStorage.TABLE_NAME,
            Key: {
                partitionKey: accountPartitionKey,
                rowKey: accountRowKey,
            },
            // Ensure the item exists before deletion
            ConditionExpression: "attribute_exists(partitionKey) AND attribute_exists(rowKey)",
        };
        this._dynamoDBClient
            .delete(params)
            .promise()
            .then(() => {
            deferred.resolve();
        })
            .catch((error) => {
            if (error.code === "ConditionalCheckFailedException") {
                deferred.reject(new Error("App pointer not found"));
            }
            else {
                deferred.reject(error);
            }
        });
        return deferred.promise;
    }
    removeAllCollaboratorsAppPointers(accountId, appId) {
        return this.getApp(accountId, appId, /*keepCollaboratorIds*/ true)
            .then((app) => {
            const collaboratorMap = app.collaborators;
            const requesterEmail = AwsStorage.getEmailForAccountId(collaboratorMap, accountId);
            const removalPromises = [];
            Object.keys(collaboratorMap).forEach((key) => {
                const collabProperties = collaboratorMap[key];
                removalPromises.push(this.removeAppPointer(collabProperties.accountId, app.id));
            });
            return q_1.default.allSettled(removalPromises);
        })
            .then(() => { });
    }
    updateAppWithPermission(accountId, app, updateCollaborator = false) {
        const appId = app.id;
        if (!appId)
            throw new Error("No app id");
        const flatApp = AwsStorage.flattenApp(app, updateCollaborator);
        return this.mergeByAppHierarchy(flatApp, appId);
    }
    insertByAppHierarchy(jsObject, appId, deploymentId) {
        const leafId = arguments[arguments.length - 1];
        const appPartitionKey = Keys.getAppPartitionKey(appId);
        const args = Array.prototype.slice.call(arguments);
        args.shift(); // Remove 'jsObject' argument
        args.pop(); // Remove the leaf id
        // Check for existence of the parent before inserting
        let fetchParentPromise = (0, q_1.default)();
        if (args.length > 0) {
            const parentRowKey = Keys.getHierarchicalAppRowKey.apply(null, args);
            const parentParams = {
                TableName: AwsStorage.TABLE_NAME,
                Key: {
                    partitionKey: appPartitionKey,
                    rowKey: parentRowKey,
                },
            };
            fetchParentPromise = q_1.default.Promise((resolve, reject) => {
                this._dynamoDBClient
                    .get(parentParams)
                    .promise()
                    .then((result) => {
                    if (!result.Item) {
                        reject(new Error("Parent entity not found"));
                    }
                    resolve();
                })
                    .catch(reject);
            });
        }
        return fetchParentPromise
            .then(() => {
            const appRowKey = Keys.getHierarchicalAppRowKey(appId, deploymentId);
            const pointer = {
                partitionKeyPointer: appPartitionKey,
                rowKeyPointer: appRowKey,
            };
            const entity = this.wrap(jsObject, pointer.partitionKeyPointer, pointer.rowKeyPointer);
            const params = {
                TableName: AwsStorage.TABLE_NAME,
                Item: entity,
                ConditionExpression: "attribute_not_exists(partitionKey) AND attribute_not_exists(rowKey)",
            };
            return q_1.default.Promise((resolve, reject) => {
                this._dynamoDBClient
                    .put(params)
                    .promise()
                    .then(() => resolve())
                    .catch((error) => {
                    if (error.code === "ConditionalCheckFailedException") {
                        reject(new Error("Entity already exists"));
                    }
                    reject(error);
                });
            });
        })
            .then(() => leafId)
            .catch((error) => {
            throw error;
        });
    }
    insertAccessKey(accessKey, accountId) {
        accessKey = storage.clone(accessKey);
        accessKey.name = utils.hashWithSHA256(accessKey.name);
        const deferred = q_1.default.defer();
        const partitionKey = Keys.getAccountPartitionKey(accountId);
        const rowKey = Keys.getAccessKeyRowKey(accountId, accessKey.id);
        const entity = this.wrap(accessKey, partitionKey, rowKey);
        const params = {
            TableName: AwsStorage.TABLE_NAME,
            Item: entity,
            ConditionExpression: "attribute_not_exists(partitionKey) AND attribute_not_exists(rowKey)",
        };
        this._dynamoDBClient
            .put(params)
            .promise()
            .then(() => {
            deferred.resolve(accessKey.id);
        })
            .catch((error) => {
            if (error.code === "ConditionalCheckFailedException") {
                deferred.reject(new Error("Access key already exists"));
            }
            else {
                deferred.reject(error);
            }
        });
        return deferred.promise;
    }
    retrieveByKey(partitionKey, rowKey) {
        const params = {
            TableName: AwsStorage.TABLE_NAME,
            Key: {
                partitionKey: partitionKey,
                rowKey: rowKey,
            },
        };
        return q_1.default.Promise((resolve, reject) => {
            this._dynamoDBClient.get(params, (error, data) => {
                if (error) {
                    console.error("AWS DynamoDB Error:", error);
                    return reject(error);
                }
                if (!data.Item) {
                    return reject(new Error("Item not found"));
                }
                resolve(this.unwrap(data.Item));
            });
        });
    }
    retrieveByAppHierarchy(appId, deploymentId) {
        const partitionKey = Keys.getAppPartitionKey(appId);
        const rowKey = Keys.getHierarchicalAppRowKey(appId, deploymentId);
        return this.retrieveByKey(partitionKey, rowKey);
    }
    /**
     * Retrieves a collection of items based on hierarchical structure
     * @param accountId - The account identifier
     * @param appId - Optional application identifier
     * @param deploymentId - Optional deployment identifier
     * @returns Promise resolving to an array of enriched items
     */
    getCollectionByHierarchy(accountId, appId, deploymentId) {
        var arguments_1 = arguments;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Prepare keys for querying
                const searchKeyArgs = [true, ...Array.from(arguments_1), ""];
                let partitionKey;
                let rowKey;
                let childrenSearchKey;
                // Determine the keys based on whether appId is provided
                if (appId) {
                    searchKeyArgs.splice(1, 1); // remove accountId
                    partitionKey = Keys.getAppPartitionKey(appId);
                    rowKey = Keys.getHierarchicalAppRowKey(appId, deploymentId);
                    childrenSearchKey = Keys.generateHierarchicalAppKey.apply(null, searchKeyArgs);
                }
                else {
                    partitionKey = Keys.getAccountPartitionKey(accountId);
                    rowKey = Keys.getHierarchicalAccountRowKey(accountId);
                    childrenSearchKey = Keys.generateHierarchicalAccountKey.apply(null, searchKeyArgs);
                }
                // Query parameters for parent record
                const parentParams = {
                    TableName: AwsStorage.TABLE_NAME,
                    KeyConditionExpression: "partitionKey = :pk AND rowKey = :rk",
                    ExpressionAttributeValues: {
                        ":pk": partitionKey,
                        ":rk": rowKey,
                    },
                };
                // Query parameters for children records
                const childrenParams = {
                    TableName: AwsStorage.TABLE_NAME,
                    KeyConditionExpression: "partitionKey = :pk AND rowKey BETWEEN :start AND :end",
                    ExpressionAttributeValues: {
                        ":pk": partitionKey,
                        ":start": childrenSearchKey,
                        ":end": childrenSearchKey + "~",
                    },
                };
                // Execute both queries concurrently
                const [parentResult, childrenResult] = yield Promise.all([
                    this._dynamoDBClient.query(parentParams).promise(),
                    this._dynamoDBClient.query(childrenParams).promise(),
                ]);
                if (!parentResult.Items || parentResult.Items.length === 0) {
                    throw new Error("Entity not found");
                }
                // Process and enrich children items
                const enrichedItems = yield this.enrichChildrenItems(childrenResult.Items || []);
                return enrichedItems;
            }
            catch (error) {
                console.error("Error in getCollectionByHierarchy:", error);
                throw error;
            }
        });
    }
    /**
     * Helper method to enrich children items with their pointer references
     * @param items - Array of items to be enriched
     * @returns Promise resolving to array of enriched items
     */
    enrichChildrenItems(items) {
        return __awaiter(this, void 0, void 0, function* () {
            const enrichmentPromises = items.map((item) => __awaiter(this, void 0, void 0, function* () {
                if (item.partitionKeyPointer && item.rowKeyPointer) {
                    const pointerParams = {
                        TableName: AwsStorage.TABLE_NAME,
                        KeyConditionExpression: "partitionKey = :pk AND rowKey = :rk",
                        ExpressionAttributeValues: {
                            ":pk": item.partitionKeyPointer,
                            ":rk": item.rowKeyPointer,
                        },
                    };
                    const pointerResult = yield this._dynamoDBClient.query(pointerParams).promise();
                    if (pointerResult.Items && pointerResult.Items.length > 0) {
                        // Remove pointer fields and merge with referenced item
                        const { partitionKeyPointer, rowKeyPointer } = item, itemWithoutPointers = __rest(item, ["partitionKeyPointer", "rowKeyPointer"]);
                        const enrichedItem = Object.assign(Object.assign({}, itemWithoutPointers), pointerResult.Items[0]);
                        return this.unwrap(enrichedItem);
                    }
                }
                return this.unwrap(item);
            }));
            return Promise.all(enrichmentPromises);
        });
    }
    cleanUpByAppHierarchy(appId, deploymentId) {
        const deferred = q_1.default.defer();
        const partitionKey = Keys.getAppPartitionKey(appId);
        const rowKey = Keys.getHierarchicalAppRowKey(appId, deploymentId);
        const descendantsSearchKey = Keys.generateHierarchicalAppKey(false, appId, deploymentId);
        const queryParams = {
            TableName: AwsStorage.TABLE_NAME,
            KeyConditionExpression: "partitionKey = :pk and rowKey BETWEEN :start AND :end",
            ExpressionAttributeValues: {
                ":pk": partitionKey,
                ":start": descendantsSearchKey,
                ":end": descendantsSearchKey + "~",
            },
        };
        const processItems = (items) => {
            const chunks = [];
            // Split items into chunks of 25 (DynamoDB batch limit)
            for (let i = 0; i < items.length; i += 25) {
                chunks.push(items.slice(i, i + 25));
            }
            const batchPromises = chunks.map((chunk) => {
                const deleteRequests = chunk.map((item) => ({
                    DeleteRequest: {
                        Key: {
                            partitionKey: item.partitionKey,
                            rowKey: item.rowKey,
                        },
                    },
                }));
                const batchParams = {
                    RequestItems: {
                        [AwsStorage.TABLE_NAME]: deleteRequests,
                    },
                };
                return this._dynamoDBClient.batchWrite(batchParams).promise();
            });
            return q_1.default.all(batchPromises);
        };
        // First query all items
        this._dynamoDBClient
            .query(queryParams)
            .promise()
            .then((result) => {
            if (!result.Items || result.Items.length === 0) {
                return deferred.resolve();
            }
            return processItems(result.Items)
                .then(() => {
                // Handle pagination if there are more items
                if (result.LastEvaluatedKey) {
                    const paginatedQuery = Object.assign(Object.assign({}, queryParams), { ExclusiveStartKey: result.LastEvaluatedKey });
                    return this._dynamoDBClient
                        .query(paginatedQuery)
                        .promise()
                        .then((nextResult) => processItems(nextResult.Items));
                }
            })
                .then(() => deferred.resolve())
                .catch((error) => deferred.reject(error));
        })
            .catch((error) => deferred.reject(error));
        return deferred.promise;
    }
    getEntityByAppHierarchy(jsObject, appId, deploymentId) {
        const partitionKey = Keys.getAppPartitionKey(appId);
        const rowKey = Keys.getHierarchicalAppRowKey(appId, deploymentId);
        return this.wrap(jsObject, partitionKey, rowKey);
    }
    mergeByAppHierarchy(jsObject, appId, deploymentId) {
        const deferred = q_1.default.defer();
        const entity = this.getEntityByAppHierarchy(jsObject, appId, deploymentId);
        // Build update expression and attribute values
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        Object.keys(entity).forEach((key, index) => {
            if (key !== "partitionKey" && key !== "rowKey") {
                const attributeName = `#attr${index}`;
                const attributeValue = `:val${index}`;
                updateExpressions.push(`${attributeName} = ${attributeValue}`);
                expressionAttributeNames[attributeName] = key;
                expressionAttributeValues[attributeValue] = entity[key];
            }
        });
        const params = {
            TableName: AwsStorage.TABLE_NAME,
            Key: {
                partitionKey: entity.partitionKey,
                rowKey: entity.rowKey,
            },
            UpdateExpression: `SET ${updateExpressions.join(", ")}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ConditionExpression: "attribute_exists(partitionKey) AND attribute_exists(rowKey)",
        };
        this._dynamoDBClient
            .update(params)
            .promise()
            .then(() => {
            deferred.resolve();
        })
            .catch((error) => {
            if (error.code === "ConditionalCheckFailedException") {
                deferred.reject(new Error("Entity does not exist"));
            }
            else {
                deferred.reject(error);
            }
        });
        return deferred.promise;
    }
    updateByAppHierarchy(jsObject, appId, deploymentId) {
        const deferred = q_1.default.defer();
        const entity = this.getEntityByAppHierarchy(jsObject, appId, deploymentId);
        // Build update expressions
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        Object.keys(entity).forEach((key, index) => {
            if (key !== "partitionKey" && key !== "rowKey") {
                const attributeName = `#attr${index}`;
                const attributeValue = `:val${index}`;
                updateExpressions.push(`${attributeName} = ${attributeValue}`);
                expressionAttributeNames[attributeName] = key;
                expressionAttributeValues[attributeValue] = entity[key];
            }
        });
        const params = {
            TableName: AwsStorage.TABLE_NAME,
            Key: {
                partitionKey: entity.partitionKey,
                rowKey: entity.rowKey,
            },
            UpdateExpression: `SET ${updateExpressions.join(", ")}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ConditionExpression: "attribute_exists(partitionKey) AND attribute_exists(rowKey)",
        };
        this._dynamoDBClient
            .update(params)
            .promise()
            .then(() => {
            deferred.resolve();
        })
            .catch((error) => {
            if (error.code === "ConditionalCheckFailedException") {
                deferred.reject(new Error("Entity does not exist"));
            }
            else {
                deferred.reject(error);
            }
        });
        return deferred.promise;
    }
    getNextLabel(packageHistory) {
        if (packageHistory.length === 0) {
            return "v1";
        }
        const lastLabel = packageHistory[packageHistory.length - 1].label;
        const lastVersion = parseInt(lastLabel.substring(1)); // Trim 'v' from the front
        return "v" + (lastVersion + 1);
    }
    static awsErrorHandler(awsError, overrideMessage = false, overrideCondition, overrideValue) {
        let errorCodeRaw;
        let errorMessage;
        // Extract error details from AWS error
        try {
            errorCodeRaw = awsError.code || awsError.name;
            errorMessage = awsError.message;
        }
        catch (error) {
            errorCodeRaw = "UnknownError";
            errorMessage = awsError.toString();
        }
        if (overrideMessage && overrideCondition === errorCodeRaw) {
            errorMessage = overrideValue;
        }
        // Map AWS error codes to storage error codes
        let errorCode;
        switch (errorCodeRaw) {
            // DynamoDB Errors
            case "ResourceNotFoundException":
            case "NoSuchKey": // S3
            case "NotFound":
                errorCode = storage.ErrorCode.NotFound;
                break;
            case "ConditionalCheckFailedException":
            case "ResourceInUseException":
                errorCode = storage.ErrorCode.AlreadyExists;
                break;
            case "ItemCollectionSizeLimitExceededException":
            case "EntityTooLarge": // S3
                errorCode = storage.ErrorCode.TooLarge;
                break;
            // Connection/Network Errors
            case "NetworkingError":
            case "TimeoutError":
            case "RequestTimeout":
            case "RequestTimeoutException":
                errorCode = storage.ErrorCode.ConnectionFailed;
                break;
            // Authentication/Authorization
            case "UnauthorizedOperation":
            case "AccessDeniedException":
            case "InvalidAccessKeyId":
            case "SignatureDoesNotMatch":
                errorCode = storage.ErrorCode.Unauthorized;
                break;
            // Throttling
            case "ProvisionedThroughputExceededException":
            case "ThrottlingException":
                errorCode = storage.ErrorCode.ThrottlingError;
                break;
            // Service errors
            case "InternalServerError":
            case "ServiceUnavailable":
                errorCode = storage.ErrorCode.ServiceError;
                break;
            // Validation errors
            case "ValidationException":
            case "InvalidParameterException":
                errorCode = storage.ErrorCode.ValidationError;
                break;
            default:
                errorCode = storage.ErrorCode.Other;
                break;
        }
        throw storage.storageError(errorCode, errorMessage);
    }
    static deleteIsCurrentAccountProperty(map) {
        if (map) {
            Object.keys(map).forEach((key) => {
                delete map[key].isCurrentAccount;
            });
        }
    }
    static flattenApp(app, updateCollaborator = false) {
        if (!app) {
            return app;
        }
        const flatApp = {};
        for (const property in app) {
            if (property === "collaborators" && updateCollaborator) {
                AwsStorage.deleteIsCurrentAccountProperty(app.collaborators);
                flatApp[property] = JSON.stringify(app[property]);
            }
            else if (property !== "collaborators") {
                // No-op updates on these properties
                flatApp[property] = app[property];
            }
        }
        return flatApp;
    }
    // Note: This does not copy the object before unflattening it
    static unflattenApp(flatApp, currentAccountId) {
        flatApp.collaborators = flatApp.collaborators ? JSON.parse(flatApp.collaborators) : {};
        const currentUserEmail = AwsStorage.getEmailForAccountId(flatApp.collaborators, currentAccountId);
        if (currentUserEmail && flatApp.collaborators[currentUserEmail]) {
            flatApp.collaborators[currentUserEmail].isCurrentAccount = true;
        }
        return flatApp;
    }
    static flattenDeployment(deployment) {
        if (!deployment) {
            return deployment;
        }
        const flatDeployment = {};
        for (const property in deployment) {
            if (property !== "package") {
                // No-op updates on these properties
                flatDeployment[property] = deployment[property];
            }
        }
        return flatDeployment;
    }
    // Note: This does not copy the object before unflattening it
    static unflattenDeployment(flatDeployment) {
        delete flatDeployment.packageHistory;
        flatDeployment.package = flatDeployment.package ? JSON.parse(flatDeployment.package) : null;
        return flatDeployment;
    }
    static isOwner(collaboratorsMap, email) {
        return (collaboratorsMap &&
            email &&
            collaboratorsMap[email] &&
            collaboratorsMap[email].permission === storage.Permissions.Owner);
    }
    static isCollaborator(collaboratorsMap, email) {
        return (collaboratorsMap &&
            email &&
            collaboratorsMap[email] &&
            collaboratorsMap[email].permission === storage.Permissions.Collaborator);
    }
    static setCollaboratorPermission(collaboratorsMap, email, permission) {
        if (collaboratorsMap && email && !(0, storage_1.isPrototypePollutionKey)(email) && collaboratorsMap[email]) {
            collaboratorsMap[email].permission = permission;
        }
    }
    static addToCollaborators(collaboratorsMap, email, collabProps) {
        if (collaboratorsMap && email && !(0, storage_1.isPrototypePollutionKey)(email) && !collaboratorsMap[email]) {
            collaboratorsMap[email] = collabProps;
        }
    }
    static getEmailForAccountId(collaboratorsMap, accountId) {
        if (collaboratorsMap) {
            for (const email of Object.keys(collaboratorsMap)) {
                if (collaboratorsMap[email].accountId === accountId) {
                    return email;
                }
            }
        }
        return null;
    }
}
exports.AwsStorage = AwsStorage;
AwsStorage.NO_ID_ERROR = "No id set";
AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME = process.env.PACKAGE_HISTORY_S3_BUCKET_NAME || "g24x7-stage-ota-pvt-package-history";
AwsStorage.PACKAGE_HISTORY_S3_PREFIX = process.env.PACKAGE_HISTORY_S3_PREFIX || "ota-history/package-history";
AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_BUCKET_NAME = process.env.PACKAGE_DOWNLOAD_CDN_S3_BUCKET_NAME || "g24x7-stage-ota-pub-package-download";
AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_PREFIX = process.env.PACKAGE_DOWNLOAD_CDN_S3_PREFIX || "ota-releases/package-downloads";
AwsStorage.PACKAGE_DOWNLOAD_CDN_URL = process.env.PACKAGE_DOWNLOAD_CDN_URL || "https://stage-cdn.my11circle.com";
AwsStorage.MAX_PACKAGE_HISTORY_LENGTH = 50;
AwsStorage.TABLE_NAME = process.env.TABLE_NAME || "ota-registery";
//# sourceMappingURL=aws-storage.js.map