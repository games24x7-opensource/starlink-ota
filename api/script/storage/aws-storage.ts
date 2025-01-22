// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as q from "q";
import * as shortid from "shortid";
import * as stream from "stream";
import * as storage from "./storage";
import * as utils from "../utils/common";

import { isPrototypePollutionKey } from "./storage";

import {DynamoDB, S3} from 'aws-sdk';

module Keys {
  // Can these symbols break us?
  const DELIMITER = " ";
  const LEAF_MARKER = "*";

  export function getAccountPartitionKey(accountId: string): string {
    validateParameters(Array.prototype.slice.apply(arguments));
    return "accountId" + DELIMITER + accountId;
  }

  export function getAccountAddress(accountId: string): Pointer {
    validateParameters(Array.prototype.slice.apply(arguments));
    return <Pointer>{
      partitionKeyPointer: getAccountPartitionKey(accountId),
      rowKeyPointer: getHierarchicalAccountRowKey(accountId),
    };
  }

  export function getAppPartitionKey(appId: string): string {
    validateParameters(Array.prototype.slice.apply(arguments));
    return "appId" + DELIMITER + appId;
  }

  export function getHierarchicalAppRowKey(appId?: string, deploymentId?: string): string {
    validateParameters(Array.prototype.slice.apply(arguments));
    return generateHierarchicalAppKey(/*markLeaf=*/ true, appId, deploymentId);
  }

  export function getHierarchicalAccountRowKey(accountId: string, appId?: string): string {
    validateParameters(Array.prototype.slice.apply(arguments));
    return generateHierarchicalAccountKey(/*markLeaf=*/ true, accountId, appId);
  }

  export function generateHierarchicalAppKey(markLeaf: boolean, appId: string, deploymentId?: string): string {
    validateParameters(Array.prototype.slice.apply(arguments).slice(1));
    let key = delimit("appId", appId, /*prependDelimiter=*/ false);

    if (typeof deploymentId !== "undefined") {
      key += delimit("deploymentId", deploymentId);
    }

    // Mark leaf key with a '*', e.g. 'appId 123 deploymentId 456' -> 'appId 123 deploymentId* 456'
    if (markLeaf) {
      const lastIdDelimiter: number = key.lastIndexOf(DELIMITER);
      key = key.substring(0, lastIdDelimiter) + LEAF_MARKER + key.substring(lastIdDelimiter);
    }

    return key;
  }

  export function generateHierarchicalAccountKey(markLeaf: boolean, accountId: string, appId?: string): string {
    validateParameters(Array.prototype.slice.apply(arguments).slice(1));
    let key = delimit("accountId", accountId, /*prependDelimiter=*/ false);

    if (typeof appId !== "undefined") {
      key += delimit("appId", appId);
    }

    // Mark leaf key with a '*', e.g. 'accountId 123 appId 456' -> 'accountId 123 appId* 456'
    if (markLeaf) {
      const lastIdDelimiter: number = key.lastIndexOf(DELIMITER);
      key = key.substring(0, lastIdDelimiter) + LEAF_MARKER + key.substring(lastIdDelimiter);
    }

    return key;
  }

  export function getAccessKeyRowKey(accountId: string, accessKeyId?: string): string {
    validateParameters(Array.prototype.slice.apply(arguments));
    let key: string = "accountId_" + accountId + "_accessKeyId*_";

    if (accessKeyId !== undefined) {
      key += accessKeyId;
    }

    return key;
  }

  export function isDeployment(rowKey: string): boolean {
    return rowKey.indexOf("deploymentId*") !== -1;
  }

  // To prevent a table scan when querying by properties for which we don't have partition information, we create shortcut
  // partitions which hold single entries
  export function getEmailShortcutAddress(email: string): Pointer {
    validateParameters(Array.prototype.slice.apply(arguments));
    // We lower-case the email in our storage lookup because Partition/RowKeys are case-sensitive, but in all other cases we leave
    // the email as-is (as a new account with a different casing would be rejected as a duplicate at creation time)
    return <Pointer>{
      partitionKeyPointer: "email" + DELIMITER + email.toLowerCase(),
      rowKeyPointer: "EMAIL",
    };
  }

  export function getShortcutDeploymentKeyPartitionKey(deploymentKey: string): string {
    validateParameters(Array.prototype.slice.apply(arguments));
    return delimit("deploymentKey", deploymentKey, /*prependDelimiter=*/ false);
  }

  export function getShortcutDeploymentKeyRowKey(): string {
    return "DeploymentKeyRowKey";
  }

  export function getShortcutAccessKeyPartitionKey(accessKeyName: string, hash: boolean = true): string {
    validateParameters(Array.prototype.slice.apply(arguments));
    return delimit("accessKey", hash ? utils.hashWithSHA256(accessKeyName) : accessKeyName, /*prependDelimiter=*/ false);
  }

  // Last layer of defense against uncaught injection attacks - raise an uncaught exception
  function validateParameters(parameters: string[]): void {
    parameters.forEach((parameter: string): void => {
      if (parameter && (parameter.indexOf(DELIMITER) >= 0 || parameter.indexOf(LEAF_MARKER) >= 0)) {
        throw storage.storageError(storage.ErrorCode.Invalid, `The parameter '${parameter}' contained invalid characters.`);
      }
    });
  }

  function delimit(fieldName: string, value: string, prependDelimiter = true): string {
    const prefix = prependDelimiter ? DELIMITER : "";
    return prefix + fieldName + DELIMITER + value;
  }
}

interface Pointer {
  partitionKeyPointer: string;
  rowKeyPointer: string;
}

interface DeploymentKeyPointer {
  appId: string;
  deploymentId: string;
}

interface AccessKeyPointer {
  accountId: string;
  expires: number;
}
export class AwsStorage implements storage.Storage {
  public static NO_ID_ERROR = "No id set";

  static PACKAGE_HISTORY_S3_BUCKET_NAME = "my11circle-logs";
  static PACKAGE_HISTORY_S3_PREFIX = "ota-v1/package-history";

  static PACKAGE_DOWNLOAD_CDN_S3_BUCKET_NAME = "g24x7.stage-reverie-website";
  static PACKAGE_DOWNLOAD_CDN_S3_PREFIX = "ota-v1/package-downloads";

  static PACKAGE_DOWNLOAD_CDN_URL = "https://stage-cdn.my11circle.com"

  private static MAX_PACKAGE_HISTORY_LENGTH = 50;
  private static TABLE_NAME = "code-push-server-stage-v1";

  private _setupPromise: q.Promise<void>;

  private _dynamoDBClient: DynamoDB.DocumentClient;
  private _s3Client: S3;


  public constructor(accountName?: string, accountKey?: string) {
    shortid.characters("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-");

    this._setupPromise = this.setup();
  }

  public reinitialize(accountName?: string, accountKey?: string): q.Promise<void> {
    console.log("Re-initializing Azure storage");
    return this.setup();
  }

  public checkHealth(): q.Promise<void> {
    return q.Promise<void>((resolve, reject) => {
        this._setupPromise
            .then(() => {
                // Check DynamoDB health
                const tableCheck: q.Promise<void> = q.Promise<void>((tableResolve, tableReject) => {
                    const params = {
                        TableName: AwsStorage.TABLE_NAME,
                        Key: {
                            partitionKey: 'health',
                            rowKey: 'health'
                        }
                    };

                    this._dynamoDBClient.get(params).promise()
                        .then(result => {
                            if (!result.Item || result.Item.health !== 'health') {
                                tableReject(
                                    storage.storageError(
                                        storage.ErrorCode.ConnectionFailed,
                                        'The DynamoDB service failed the health check'
                                    )
                                );
                            } else {
                                tableResolve();
                            }
                        })
                        .catch(tableReject);
                });

                // Check S3 bucket health
                const acquisitionBucketCheck: q.Promise<void> = q.Promise<void>((bucketResolve, bucketReject) => {
                    const params = {
                        Bucket: AwsStorage.TABLE_NAME,
                        Key: 'health'
                    };

                    this._s3Client.headObject(params).promise()
                        .then(() => bucketResolve())
                        .catch(error => {
                            bucketReject(
                                storage.storageError(
                                    storage.ErrorCode.ConnectionFailed,
                                    `The S3 service failed the health check for ${AwsStorage.TABLE_NAME}: ${error.message}`
                                )
                            );
                        });
                });

                const historyBucketCheck: q.Promise<void> = q.Promise<void>((bucketResolve, bucketReject) => {
                    const params = {
                        Bucket: AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME,
                        Key: `${AwsStorage.PACKAGE_HISTORY_S3_PREFIX}/health`
                    };

                    this._s3Client.headObject(params).promise()
                        .then(() => bucketResolve())
                        .catch(error => {
                            bucketReject(
                                storage.storageError(
                                    storage.ErrorCode.ConnectionFailed,
                                    `The S3 service failed the health check for ${AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME}: ${error.message}`
                                )
                            );
                        });
                });

                return q.all([tableCheck, acquisitionBucketCheck, historyBucketCheck]);
            })
            .then(() => {
                resolve();
            })
            .catch(reject);
    });
}

  public addAccount(account: storage.Account): q.Promise<string> {
    account = storage.clone(account); // pass by value
    account.id = 'g24x7' //shortid.generate();

    const hierarchicalAddress: Pointer = Keys.getAccountAddress(account.id);
    const emailShortcutAddress: Pointer = Keys.getEmailShortcutAddress(account.email);

    // Store the actual Account in the email partition, and a Pointer in the other partitions
    const accountPointer: Pointer = Keys.getEmailShortcutAddress(account.email);

    return this._setupPromise
      .then(() => {
        const entity = this.wrap(account, emailShortcutAddress.partitionKeyPointer, emailShortcutAddress.rowKeyPointer);
        const params = {
          TableName: AwsStorage.TABLE_NAME,
          Item: entity
        };
        return this._dynamoDBClient.put(params).promise();
      })
      .then(() => {
        const entity = this.wrap(accountPointer, hierarchicalAddress.partitionKeyPointer, hierarchicalAddress.rowKeyPointer);
        const params = {
          TableName: AwsStorage.TABLE_NAME,
          Item: entity
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

  public getAccount(accountId: string): q.Promise<storage.Account> {
    const address: Pointer = Keys.getAccountAddress(accountId);

    return this._setupPromise
      .then(() => {
        return this.retrieveByKey(address.partitionKeyPointer, address.rowKeyPointer);
      })
      .then((pointer: Pointer) => {
        return this.retrieveByKey(pointer.partitionKeyPointer, pointer.rowKeyPointer);
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public getAccountByEmail(email: string): q.Promise<storage.Account> {
    const address: Pointer = Keys.getEmailShortcutAddress(email);
    return this._setupPromise
      .then(() => {
        return this.retrieveByKey(address.partitionKeyPointer, address.rowKeyPointer);
      })
      .catch((azureError: any): any => {
        AwsStorage.awsErrorHandler(
          azureError,
          true,
          "ResourceNotFound",
          "The specified e-mail address doesn't represent a registered user"
        );
      });
  }

  public updateAccount(email: string, updateProperties: storage.Account): q.Promise<void> {
    if (!email) throw new Error("No account email");
    const address: Pointer = Keys.getEmailShortcutAddress(email);

    const updateExpression = 'set azureAdId = :azureAdId, gitHubId = :gitHubId, microsoftId = :microsoftId';
    const expressionValues = {
      ':azureAdId': updateProperties.azureAdId,
      ':gitHubId': updateProperties.gitHubId,
      ':microsoftId': updateProperties.microsoftId
    };

    const params = {
      TableName: AwsStorage.TABLE_NAME,
      Key: {
        partitionKey: address.partitionKeyPointer,
        rowKey: address.rowKeyPointer
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues
    };

    return this._setupPromise
      .then(() => this._dynamoDBClient.update(params).promise())
      .catch(AwsStorage.awsErrorHandler);
  }

  public getAccountIdFromAccessKey(accessKey: string): q.Promise<string> {
    const partitionKey: string = Keys.getShortcutAccessKeyPartitionKey(accessKey);
    const rowKey: string = "";

    return this._setupPromise
      .then(() => {
        return this.retrieveByKey(partitionKey, rowKey);
      })
      .then((accountIdObject: AccessKeyPointer) => {
        if (new Date().getTime() >= accountIdObject.expires) {
          throw storage.storageError(storage.ErrorCode.Expired, "The access key has expired.");
        }

        return accountIdObject.accountId;
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public addApp(accountId: string, app: storage.App): q.Promise<storage.App> {
    app = storage.clone(app); // pass by value
    app.id = shortid.generate();

    return this._setupPromise
      .then(() => {
        return this.getAccount(accountId);
      })
      .then((account: storage.Account) => {
        const collabMap: storage.CollaboratorMap = {};
        collabMap[account.email] = { accountId: accountId, permission: storage.Permissions.Owner };

        app.collaborators = collabMap;

        const flatApp: any = AwsStorage.flattenApp(app, /*updateCollaborator*/ true);
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

  public getApps(accountId: string): q.Promise<storage.App[]> {
    return this._setupPromise
      .then(() => {
        return this.getCollectionByHierarchy(accountId);
      })
      .then((flatApps: any[]) => {
        const apps: storage.App[] = flatApps.map((flatApp: any) => {
          return AwsStorage.unflattenApp(flatApp, accountId);
        });

        return apps;
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public getApp(accountId: string, appId: string, keepCollaboratorIds: boolean = false): q.Promise<storage.App> {
    return this._setupPromise
      .then(() => {
        return this.retrieveByAppHierarchy(appId);
      })
      .then((flatApp: any) => {
        return AwsStorage.unflattenApp(flatApp, accountId);
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public removeApp(accountId: string, appId: string): q.Promise<void> {
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

  public updateApp(accountId: string, app: storage.App): q.Promise<void> {
    const appId: string = app.id;
    if (!appId) throw new Error("No app id");

    return this._setupPromise
      .then(() => {
        return this.updateAppWithPermission(accountId, app, /*updateCollaborator*/ false);
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public transferApp(accountId: string, appId: string, email: string): q.Promise<void> {
    let app: storage.App;
    let targetCollaboratorAccountId: string;
    let requestingCollaboratorEmail: string;
    let isTargetAlreadyCollaborator: boolean;

    return this._setupPromise
      .then(() => {
        const getAppPromise: q.Promise<storage.App> = this.getApp(accountId, appId, /*keepCollaboratorIds*/ true);
        const accountPromise: q.Promise<storage.Account> = this.getAccountByEmail(email);
        return q.all<any>([getAppPromise, accountPromise]);
      })
      .spread((appPromiseResult: storage.App, accountPromiseResult: storage.Account) => {
        targetCollaboratorAccountId = accountPromiseResult.id;
        email = accountPromiseResult.email; // Use the original email stored on the account to ensure casing is consistent
        app = appPromiseResult;
        requestingCollaboratorEmail = AwsStorage.getEmailForAccountId(app.collaborators, accountId);

        if (requestingCollaboratorEmail === email) {
          throw storage.storageError(storage.ErrorCode.AlreadyExists, "The given account already owns the app.");
        }

        return this.getApps(targetCollaboratorAccountId);
      })
      .then((appsForCollaborator: storage.App[]) => {
        if (storage.NameResolver.isDuplicate(appsForCollaborator, app.name)) {
          throw storage.storageError(
            storage.ErrorCode.AlreadyExists,
            'Cannot transfer ownership. An app with name "' + app.name + '" already exists for the given collaborator.'
          );
        }

        isTargetAlreadyCollaborator = AwsStorage.isCollaborator(app.collaborators, email);

        // Update the current owner to be a collaborator
        AwsStorage.setCollaboratorPermission(app.collaborators, requestingCollaboratorEmail, storage.Permissions.Collaborator);

        // set target collaborator as an owner.
        if (isTargetAlreadyCollaborator) {
          AwsStorage.setCollaboratorPermission(app.collaborators, email, storage.Permissions.Owner);
        } else {
          const targetOwnerProperties: storage.CollaboratorProperties = {
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

  public addCollaborator(accountId: string, appId: string, email: string): q.Promise<void> {
    return this._setupPromise
      .then(() => {
        const getAppPromise: q.Promise<storage.App> = this.getApp(accountId, appId, /*keepCollaboratorIds*/ true);
        const accountPromise: q.Promise<storage.Account> = this.getAccountByEmail(email);
        return q.all<any>([getAppPromise, accountPromise]);
      })
      .spread((app: storage.App, account: storage.Account) => {
        // Use the original email stored on the account to ensure casing is consistent
        email = account.email;
        return this.addCollaboratorWithPermissions(accountId, app, email, {
          accountId: account.id,
          permission: storage.Permissions.Collaborator,
        });
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public getCollaborators(accountId: string, appId: string): q.Promise<storage.CollaboratorMap> {
    return this._setupPromise
      .then(() => {
        return this.getApp(accountId, appId, /*keepCollaboratorIds*/ false);
      })
      .then((app: storage.App) => {
        return q<storage.CollaboratorMap>(app.collaborators);
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public removeCollaborator(accountId: string, appId: string, email: string): q.Promise<void> {
    return this._setupPromise
      .then(() => {
        return this.getApp(accountId, appId, /*keepCollaboratorIds*/ true);
      })
      .then((app: storage.App) => {
        const removedCollabProperties: storage.CollaboratorProperties = app.collaborators[email];

        if (!removedCollabProperties) {
          throw storage.storageError(storage.ErrorCode.NotFound, "The given email is not a collaborator for this app.");
        }

        if (!AwsStorage.isOwner(app.collaborators, email)) {
          delete app.collaborators[email];
        } else {
          throw storage.storageError(storage.ErrorCode.AlreadyExists, "Cannot remove the owner of the app from collaborator list.");
        }

        return this.updateAppWithPermission(accountId, app, /*updateCollaborator*/ true).then(() => {
          return this.removeAppPointer(removedCollabProperties.accountId, app.id);
        });
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public addDeployment(accountId: string, appId: string, deployment: storage.Deployment): q.Promise<string> {
    let deploymentId: string;
    
    return this._setupPromise
        .then(() => {
            const flatDeployment: any = AwsStorage.flattenDeployment(deployment);
            flatDeployment.id = shortid.generate();

            return this.insertByAppHierarchy(flatDeployment, appId, flatDeployment.id);
        })
        .then((returnedId: string) => {
            deploymentId = returnedId;
            
            // Upload empty history array to S3
          const params = {
            Bucket: AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME,
            Key: `${AwsStorage.PACKAGE_HISTORY_S3_PREFIX}/${deploymentId}`,
            Body: JSON.stringify([]),
            ContentType: 'application/json'
          };

            return q.Promise<void>((resolve, reject) => {
                this._s3Client.putObject(params).promise()
                    .then(() => resolve())
                    .catch(reject);
            });
        })
        .then(() => {
            const shortcutPartitionKey: string = Keys.getShortcutDeploymentKeyPartitionKey(deployment.key);
            const shortcutRowKey: string = Keys.getShortcutDeploymentKeyRowKey();
            
            const pointer: DeploymentKeyPointer = {
                appId: appId,
                deploymentId: deploymentId,
            };

            const entity = this.wrap(pointer, shortcutPartitionKey, shortcutRowKey);
            
            // Store pointer in DynamoDB
            const params = {
                TableName: AwsStorage.TABLE_NAME,
                Item: entity,
                ConditionExpression: 'attribute_not_exists(partitionKey) AND attribute_not_exists(rowKey)'
            };

            return q.Promise<void>((resolve, reject) => {
                this._dynamoDBClient.put(params).promise()
                    .then(() => resolve())
                    .catch(reject);
            });
        })
        .then(() => {
            return deploymentId;
        })
        .catch((error: any) => {
            // Handle specific AWS errors
            if (error.code === 'ConditionalCheckFailedException') {
                throw storage.storageError(storage.ErrorCode.AlreadyExists, 'Deployment already exists');
            }
            return AwsStorage.awsErrorHandler(error);
        });
}

  public getDeploymentInfo(deploymentKey: string): q.Promise<storage.DeploymentInfo> {
    const partitionKey: string = Keys.getShortcutDeploymentKeyPartitionKey(deploymentKey);
    const rowKey: string = Keys.getShortcutDeploymentKeyRowKey();

    return this._setupPromise
      .then(() => {
        return this.retrieveByKey(partitionKey, rowKey);
      })
      .then((pointer: DeploymentKeyPointer): storage.DeploymentInfo => {
        if (!pointer) {
          return null;
        }

        return { appId: pointer.appId, deploymentId: pointer.deploymentId };
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public getPackageHistoryFromDeploymentKey(deploymentKey: string): q.Promise<storage.Package[]> {
    const pointerPartitionKey: string = Keys.getShortcutDeploymentKeyPartitionKey(deploymentKey);
    const pointerRowKey: string = Keys.getShortcutDeploymentKeyRowKey();

    return this._setupPromise
      .then(() => {
        return this.retrieveByKey(pointerPartitionKey, pointerRowKey);
      })
      .then((pointer: DeploymentKeyPointer) => {
        if (!pointer) return null;

        return this.getPackageHistoryFromBlob(pointer.deploymentId);
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public getDeployment(accountId: string, appId: string, deploymentId: string): q.Promise<storage.Deployment> {
    return this._setupPromise
      .then(() => {
        return this.retrieveByAppHierarchy(appId, deploymentId);
      })
      .then((flatDeployment: any) => {
        return AwsStorage.unflattenDeployment(flatDeployment);
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public getDeployments(accountId: string, appId: string): q.Promise<storage.Deployment[]> {
    return this._setupPromise
      .then(() => {
        return this.getCollectionByHierarchy(accountId, appId);
      })
      .then((flatDeployments: any[]) => {
        const deployments: storage.Deployment[] = [];
        flatDeployments.forEach((flatDeployment: any) => {
          deployments.push(AwsStorage.unflattenDeployment(flatDeployment));
        });

        return deployments;
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public removeDeployment(accountId: string, appId: string, deploymentId: string): q.Promise<void> {
    return this._setupPromise
      .then(() => {
        return this.cleanUpByAppHierarchy(appId, deploymentId);
      })
      .then(() => {
        return this.deleteHistoryBlob(deploymentId);
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public updateDeployment(accountId: string, appId: string, deployment: storage.Deployment): q.Promise<void> {
    const deploymentId: string = deployment.id;
    if (!deploymentId) throw new Error("No deployment id");

    return this._setupPromise
      .then(() => {
        const flatDeployment: any = AwsStorage.flattenDeployment(deployment);
        return this.mergeByAppHierarchy(flatDeployment, appId, deploymentId);
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public commitPackage(
    accountId: string,
    appId: string,
    deploymentId: string,
    appPackage: storage.Package
  ): q.Promise<storage.Package> {
    if (!deploymentId) throw new Error("No deployment id");
    if (!appPackage) throw new Error("No package specified");

    appPackage = storage.clone(appPackage); // pass by value

    let packageHistory: storage.Package[];
    return this._setupPromise
      .then(() => {
        return this.getPackageHistoryFromBlob(deploymentId);
      })
      .then((history: storage.Package[]) => {
        packageHistory = history;
        appPackage.label = this.getNextLabel(packageHistory);
        return this.getAccount(accountId);
      })
      .then((account: storage.Account) => {
        appPackage.releasedBy = account.email;

        // Remove the rollout value for the last package.
        const lastPackage: storage.Package =
          packageHistory && packageHistory.length ? packageHistory[packageHistory.length - 1] : null;
        if (lastPackage) {
          lastPackage.rollout = null;
        }

        packageHistory.push(appPackage);

        if (packageHistory.length > AwsStorage.MAX_PACKAGE_HISTORY_LENGTH) {
          packageHistory.splice(0, packageHistory.length - AwsStorage.MAX_PACKAGE_HISTORY_LENGTH);
        }

        const flatPackage: any = { id: deploymentId, package: JSON.stringify(appPackage) };
        return this.mergeByAppHierarchy(flatPackage, appId, deploymentId);
      })
      .then(() => {
        return this.uploadToHistoryBlob(deploymentId, JSON.stringify(packageHistory));
      })
      .then((): storage.Package => {
        return appPackage;
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public clearPackageHistory(accountId: string, appId: string, deploymentId: string): q.Promise<void> {
    return this._setupPromise
      .then(() => {
        return this.retrieveByAppHierarchy(appId, deploymentId);
      })
      .then((flatDeployment: any) => {
        delete flatDeployment.package;
        return this.updateByAppHierarchy(flatDeployment, appId, deploymentId);
      })
      .then(() => {
        return this.uploadToHistoryBlob(deploymentId, JSON.stringify([]));
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public getPackageHistory(accountId: string, appId: string, deploymentId: string): q.Promise<storage.Package[]> {
    return this._setupPromise
      .then(() => {
        return this.getPackageHistoryFromBlob(deploymentId);
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public updatePackageHistory(accountId: string, appId: string, deploymentId: string, history: storage.Package[]): q.Promise<void> {
    // If history is null or empty array we do not update the package history, use clearPackageHistory for that.
    if (!history || !history.length) {
      throw storage.storageError(storage.ErrorCode.Invalid, "Cannot clear package history from an update operation");
    }

    return this._setupPromise
      .then(() => {
        const flatDeployment: any = { id: deploymentId, package: JSON.stringify(history[history.length - 1]) };
        return this.mergeByAppHierarchy(flatDeployment, appId, deploymentId);
      })
      .then(() => {
        return this.uploadToHistoryBlob(deploymentId, JSON.stringify(history));
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public addBlob(blobId: string, stream: stream.Readable, streamLength: number): q.Promise<string> {
    return this._setupPromise
        .then(() => {
            return utils.streamToBuffer(stream);
        })
        .then((buffer: Buffer) => {
            const params = {
                Bucket: AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_BUCKET_NAME,
                Key: `${AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_PREFIX}/${blobId}`,
                Body: Buffer.from(buffer),
                ContentLength: streamLength,
                ContentType: 'application/octet-stream'
            };

            return q.Promise<void>((resolve, reject) => {
                this._s3Client.putObject(params).promise()
                    .then(() => resolve())
                    .catch(error => {
                        if (error.code === 'NoSuchBucket') {
                            reject(storage.storageError(
                                storage.ErrorCode.NotFound,
                                `Bucket ${AwsStorage.TABLE_NAME} not found`
                            ));
                        } else {
                            reject(error);
                        }
                    });
            });
        })
        .then(() => {
            return blobId;
        })
        .catch(AwsStorage.awsErrorHandler);
}

public getBlobUrl(blobId: string): q.Promise<string> {
  return this._setupPromise
      .then(() => {
          return q.Promise<string>((resolve, reject) => {
              resolve(`${AwsStorage.PACKAGE_DOWNLOAD_CDN_URL}/${AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_PREFIX}/${blobId}`);
          });
      })
      .catch(AwsStorage.awsErrorHandler);
}

public removeBlob(blobId: string): q.Promise<void> {
  return this._setupPromise
      .then(() => {
          return q.Promise<void>((resolve, reject) => {
              const params: S3.DeleteObjectRequest = {
                Bucket: AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_BUCKET_NAME,
                Key: `${AwsStorage.PACKAGE_DOWNLOAD_CDN_S3_PREFIX}/${blobId}`,
              };

              // First check if object exists
              this._s3Client.headObject(params).promise()
                  .then(() => {
                      // Object exists, proceed with deletion
                      return this._s3Client.deleteObject(params).promise();
                  })
                  .then(() => {
                      resolve();
                  })
                  .catch(error => {
                      if (error.code === 'NotFound' || error.code === 'NoSuchKey') {
                          reject(storage.storageError(
                              storage.ErrorCode.NotFound,
                              `Blob ${blobId} not found`
                          ));
                      } else {
                          reject(error);
                      }
                  });
          });
      })
      .catch(AwsStorage.awsErrorHandler);
}

  public addAccessKey(accountId: string, accessKey: storage.AccessKey): q.Promise<string> {
    accessKey = storage.clone(accessKey); // pass by value
    accessKey.id = shortid.generate();

    return this._setupPromise
        .then(() => {
            // Store access key pointer
            const partitionKey: string = Keys.getShortcutAccessKeyPartitionKey(accessKey.name);
            const rowKey: string = "";
            const accessKeyPointer: AccessKeyPointer = { 
                accountId, 
                expires: accessKey.expires 
            };

            const params = {
                TableName: AwsStorage.TABLE_NAME,
                Item: this.wrap(accessKeyPointer, partitionKey, rowKey),
                ConditionExpression: 'attribute_not_exists(partitionKey) AND attribute_not_exists(rowKey)'
            };

            return q.Promise<void>((resolve, reject) => {
                this._dynamoDBClient.put(params).promise()
                    .then(() => resolve())
                    .catch(error => {
                        if (error.code === 'ConditionalCheckFailedException') {
                            reject(new Error('Access key name already exists'));
                        } else {
                            reject(error);
                        }
                    });
            });
        })
        .then(() => {
            // Store actual access key
            return this.insertAccessKey(accessKey, accountId);
        })
        .then((): string => {
            return accessKey.id;
        })
        .catch((error: any) => {
            // Clean up pointer if second operation fails
            if (error.code !== 'ConditionalCheckFailedException') {
                const deleteParams = {
                    TableName: AwsStorage.TABLE_NAME,
                    Key: {
                        partitionKey: Keys.getShortcutAccessKeyPartitionKey(accessKey.name),
                        rowKey: ""
                    }
                };
                this._dynamoDBClient.delete(deleteParams).promise()
                    .catch(() => {}); // Ignore cleanup errors
            }
            return AwsStorage.awsErrorHandler(error);
        });
}

  public getAccessKey(accountId: string, accessKeyId: string): q.Promise<storage.AccessKey> {
    const partitionKey: string = Keys.getAccountPartitionKey(accountId);
    const rowKey: string = Keys.getAccessKeyRowKey(accountId, accessKeyId);
    return this._setupPromise
      .then(() => {
        return this.retrieveByKey(partitionKey, rowKey);
      })
      .catch(AwsStorage.awsErrorHandler);
  }

  public getAccessKeys(accountId: string): q.Promise<storage.AccessKey[]> {
    const deferred = q.defer<storage.AccessKey[]>();

    const partitionKey: string = Keys.getAccountPartitionKey(accountId);
    const rowKey: string = Keys.getHierarchicalAccountRowKey(accountId);
    const searchKey: string = Keys.getAccessKeyRowKey(accountId);

    const params = {
        TableName: AwsStorage.TABLE_NAME,
        KeyConditionExpression: 'partitionKey = :pk and rowKey BETWEEN :start AND :end',
        ExpressionAttributeValues: {
            ':pk': partitionKey,
            ':start': searchKey,
            ':end': searchKey + '~'
        }
    };

    // First check if account exists
    const accountCheckParams = {
        TableName: AwsStorage.TABLE_NAME,
        Key: {
            partitionKey: partitionKey,
            rowKey: rowKey
        }
    };

    this._setupPromise
        .then(() => {
            return this._dynamoDBClient.get(accountCheckParams).promise();
        })
        .then(result => {
            if (!result.Item) {
                throw storage.storageError(storage.ErrorCode.NotFound, 'Account not found');
            }

            return this._dynamoDBClient.query(params).promise();
        })
        .then(async (result) => {
            let items = result.Items || [];
            let lastEvaluatedKey = result.LastEvaluatedKey;

            // Handle pagination if needed
            while (lastEvaluatedKey) {
                const nextParams = {
                    ...params,
                    ExclusiveStartKey: lastEvaluatedKey
                };
                const nextResult = await this._dynamoDBClient.query(nextParams).promise();
                items = items.concat(nextResult.Items || []);
                lastEvaluatedKey = nextResult.LastEvaluatedKey;
            }

            const accessKeys: storage.AccessKey[] = items
                .filter(item => item.rowKey !== rowKey) // Don't include the account
                .map(item => this.unwrap(item));

            deferred.resolve(accessKeys);
        })
        .catch((error: any) => {
            if (error.code === 'ResourceNotFoundException') {
                deferred.reject(storage.storageError(storage.ErrorCode.NotFound, 'Table not found'));
            } else {
                deferred.reject(AwsStorage.awsErrorHandler(error));
            }
        });

    return deferred.promise;
}

public removeAccessKey(accountId: string, accessKeyId: string): q.Promise<void> {
  return this._setupPromise
      .then(() => {
          return this.getAccessKey(accountId, accessKeyId);
      })
      .then((accessKey) => {
          const mainDeleteParams = {
              TableName: AwsStorage.TABLE_NAME,
              Key: {
                  partitionKey: Keys.getAccountPartitionKey(accountId),
                  rowKey: Keys.getAccessKeyRowKey(accountId, accessKeyId)
              },
              ConditionExpression: 'attribute_exists(partitionKey) AND attribute_exists(rowKey)'
          };

          const shortcutDeleteParams = {
              TableName: AwsStorage.TABLE_NAME,
              Key: {
                  partitionKey: Keys.getShortcutAccessKeyPartitionKey(accessKey.name, false),
                  rowKey: ""
              },
              ConditionExpression: 'attribute_exists(partitionKey) AND attribute_exists(rowKey)'
          };

          return q.all([
              q.Promise<void>((resolve, reject) => {
                  this._dynamoDBClient.delete(mainDeleteParams).promise()
                      .then(() => resolve())
                      .catch(error => {
                          if (error.code === 'ConditionalCheckFailedException') {
                              reject(storage.storageError(storage.ErrorCode.NotFound, 'Access key not found'));
                          }
                          reject(error);
                      });
              }),
              q.Promise<void>((resolve, reject) => {
                  this._dynamoDBClient.delete(shortcutDeleteParams).promise()
                      .then(() => resolve())
                      .catch(error => {
                          if (error.code === 'ConditionalCheckFailedException') {
                              // Ignore if shortcut doesn't exist
                              resolve();
                          }
                          reject(error);
                      });
              })
          ]);
      })
      .catch(AwsStorage.awsErrorHandler);
}

public updateAccessKey(accountId: string, accessKey: storage.AccessKey): q.Promise<void> {
  if (!accessKey) {
      throw new Error("No access key");
  }

  if (!accessKey.id) {
      throw new Error("No access key id");
  }

  const partitionKey: string = Keys.getAccountPartitionKey(accountId);
  const rowKey: string = Keys.getAccessKeyRowKey(accountId, accessKey.id);

  interface DynamoDBUpdateParams {
      TableName: string;
      Key: {
          partitionKey: string;
          rowKey: string;
      };
      UpdateExpression: string;
      ExpressionAttributeNames: { [key: string]: string };
      ExpressionAttributeValues: { [key: string]: any };
      ConditionExpression: string;
  }

  return this._setupPromise
      .then(() => {
          // Main access key update
          const mainUpdateFields = Object.entries(accessKey)
              .filter(([key]) => !['partitionKey', 'rowKey'].includes(key))
              .reduce((acc, [key, value], index) => {
                  acc.expressions.push(`#field${index} = :value${index}`);
                  acc.names[`#field${index}`] = key;
                  acc.values[`:value${index}`] = value;
                  return acc;
              }, {
                  expressions: [] as string[],
                  names: {} as { [key: string]: string },
                  values: {} as { [key: string]: any }
              });

          const mainUpdateParams: DynamoDBUpdateParams = {
              TableName: AwsStorage.TABLE_NAME,
              Key: {
                  partitionKey,
                  rowKey
              },
              UpdateExpression: `SET ${mainUpdateFields.expressions.join(', ')}`,
              ExpressionAttributeNames: mainUpdateFields.names,
              ExpressionAttributeValues: mainUpdateFields.values,
              ConditionExpression: 'attribute_exists(partitionKey) AND attribute_exists(rowKey)'
          };

          return q.Promise<void>((resolve, reject) => {
              this._dynamoDBClient.update(mainUpdateParams).promise()
                  .then(() => resolve())
                  .catch(error => {
                      if (error.code === 'ConditionalCheckFailedException') {
                          reject(storage.storageError(storage.ErrorCode.NotFound, 'Access key not found'));
                      }
                      reject(error);
                  });
          });
      })
      .then(() => {
          // Pointer update
          const pointerUpdateParams: DynamoDBUpdateParams = {
              TableName: AwsStorage.TABLE_NAME,
              Key: {
                  partitionKey: Keys.getShortcutAccessKeyPartitionKey(accessKey.name, false),
                  rowKey: ""
              },
              UpdateExpression: 'SET #accountId = :accountId, #expires = :expires',
              ExpressionAttributeNames: {
                  '#accountId': 'accountId',
                  '#expires': 'expires'
              },
              ExpressionAttributeValues: {
                  ':accountId': accountId,
                  ':expires': accessKey.expires
              },
              ConditionExpression: 'attribute_exists(partitionKey) AND attribute_exists(rowKey)'
          };

          return q.Promise<void>((resolve, reject) => {
              this._dynamoDBClient.update(pointerUpdateParams).promise()
                  .then(() => resolve())
                  .catch(error => {
                      if (error.code === 'ConditionalCheckFailedException') {
                          reject(storage.storageError(storage.ErrorCode.NotFound, 'Access key pointer not found'));
                      }
                      reject(error);
                  });
          });
      })
      .catch(AwsStorage.awsErrorHandler);
}

  // No-op for safety, so that we don't drop the wrong db, pending a cleaner solution for removing test data.
  public dropAll(): q.Promise<void> {
    return q(<void>null);
  }

  private setup(): q.Promise<void> {
    const deferred = q.defer<void>();

    try {
      const awsConfig = {
        region: process.env.AWS_REGION || 'ap-south-1'
      };

      const dynamoDBClient = new DynamoDB.DocumentClient(awsConfig);
      const s3Client = new S3(awsConfig);

      this._dynamoDBClient = dynamoDBClient;
      this._s3Client = s3Client;

      deferred.resolve();
    } catch (error) {
      deferred.reject(error);
    }

    return deferred.promise;
  }

  private blobHealthCheck(bucket: string): q.Promise<void> {
    return q.Promise<void>((resolve, reject) => {
        const params: S3.GetObjectRequest = {
            Bucket: bucket,
            Key: 'health'
        };

        this._s3Client.getObject(params).promise()
            .then(response => {
                if (!response.Body) {
                    throw new Error('Health check object is empty');
                }

                const content = response.Body.toString();
                if (content !== 'health') {
                    throw storage.storageError(
                        storage.ErrorCode.ConnectionFailed,
                        `The S3 service failed the health check for ${bucket}: invalid content`
                    );
                }
                resolve();
            })
            .catch(error => {
                if (error.code === 'NoSuchBucket') {
                    reject(storage.storageError(
                        storage.ErrorCode.ConnectionFailed,
                        `The S3 bucket ${bucket} does not exist`
                    ));
                } else if (error.code === 'NoSuchKey') {
                    reject(storage.storageError(
                        storage.ErrorCode.ConnectionFailed,
                        `Health check object not found in bucket ${bucket}`
                    ));
                } else {
                    reject(storage.storageError(
                        storage.ErrorCode.ConnectionFailed,
                        `The S3 service failed the health check for ${bucket}: ${error.message}`
                    ));
                }
            });
    });
}

private getPackageHistoryFromBlob(deploymentId: string): q.Promise<storage.Package[]> {
  return q.Promise<storage.Package[]>((resolve, reject) => {
      const params: S3.GetObjectRequest = {
        Bucket: AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME,
        Key: `${AwsStorage.PACKAGE_HISTORY_S3_PREFIX}/${deploymentId}`,
      };

      this._s3Client.getObject(params).promise()
          .then(response => {
              if (!response.Body) {
                  throw storage.storageError(
                      storage.ErrorCode.NotFound,
                      'Package history blob is empty'
                  );
              }

              try {
                  const content = response.Body.toString('utf-8');
                  const parsedContents = JSON.parse(content) as storage.Package[];
                  resolve(parsedContents);
              } catch (parseError) {
                  reject(storage.storageError(
                      storage.ErrorCode.Invalid,
                      `Failed to parse package history: ${parseError.message}`
                  ));
              }
          })
          .catch(error => {
              if (error.code === 'NoSuchKey') {
                  reject(storage.storageError(
                      storage.ErrorCode.NotFound,
                      `Package history not found for ID: ${deploymentId}`
                  ));
              } else {
                  reject(AwsStorage.awsErrorHandler(error));
              }
          });
  });
}

private uploadToHistoryBlob(deploymentId: string, content: string): q.Promise<void> {
  return q.Promise<void>((resolve, reject) => {
      const params: S3.PutObjectRequest = {
          Bucket: AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME,
          Key: `${AwsStorage.PACKAGE_HISTORY_S3_PREFIX}/${deploymentId}`,
          Body: content,
          ContentType: 'application/json',
          ContentLength: Buffer.from(content).length
      };

      this._s3Client.putObject(params).promise()
          .then(() => resolve())
          .catch(error => {
              if (error.code === 'NoSuchBucket') {
                  reject(storage.storageError(
                      storage.ErrorCode.NotFound,
                      `History bucket ${AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME} not found`
                  ));
              } else {
                  reject(AwsStorage.awsErrorHandler(error));
              }
          });
  });
}

private deleteHistoryBlob(deploymentId: string): q.Promise<void> {
  return q.Promise<void>((resolve, reject) => {
      const params: S3.DeleteObjectRequest = {
        Bucket: AwsStorage.PACKAGE_HISTORY_S3_BUCKET_NAME,
        Key: `${AwsStorage.PACKAGE_HISTORY_S3_PREFIX}/${deploymentId}`,
      };

      // First check if object exists
      this._s3Client.headObject(params).promise()
          .then(() => {
              return this._s3Client.deleteObject(params).promise();
          })
          .then(() => resolve())
          .catch(error => {
              if (error.code === 'NotFound' || error.code === 'NoSuchKey') {
                  reject(storage.storageError(
                      storage.ErrorCode.NotFound,
                      `History blob ${deploymentId} not found`
                  ));
              } else {
                  reject(AwsStorage.awsErrorHandler(error));
              }
          });
  });
}

  private wrap(jsObject: any, partitionKey: string, rowKey: string): any {
    return {
      partitionKey,
      rowKey,
      ...jsObject,
    };
  }

  private unwrap(entity: any, includeKey?: boolean): any {
    const { partitionKey, rowKey, etag, timestamp, createdTime, ...rest } = entity;

    let unwrapped = includeKey ? { partitionKey, rowKey, ...rest } : rest;

    if (typeof createdTime === "bigint") {
      unwrapped = { ...unwrapped, createdTime: Number(createdTime) };
    }

    return unwrapped;
  }

  private addCollaboratorWithPermissions(
    accountId: string,
    app: storage.App,
    email: string,
    collabProperties: storage.CollaboratorProperties
  ): q.Promise<void> {
    if (app && app.collaborators && !app.collaborators[email]) {
      app.collaborators[email] = collabProperties;
      return this.updateAppWithPermission(accountId, app, /*updateCollaborator*/ true).then(() => {
        return this.addAppPointer(collabProperties.accountId, app.id);
      });
    } else {
      throw storage.storageError(storage.ErrorCode.AlreadyExists, "The given account is already a collaborator for this app.");
    }
  }

  private addAppPointer(accountId: string, appId: string): q.Promise<void> {
    const deferred = q.defer<void>();

    const appPartitionKey: string = Keys.getAppPartitionKey(appId);
    const appRowKey: string = Keys.getHierarchicalAppRowKey(appId);
    const pointer: Pointer = { partitionKeyPointer: appPartitionKey, rowKeyPointer: appRowKey };

    const accountPartitionKey: string = Keys.getAccountPartitionKey(accountId);
    const accountRowKey: string = Keys.getHierarchicalAccountRowKey(accountId, appId);

    const entity = this.wrap(pointer, accountPartitionKey, accountRowKey);
    
    const params = {
        TableName: AwsStorage.TABLE_NAME,
        Item: entity,
        ConditionExpression: 'attribute_not_exists(partitionKey) AND attribute_not_exists(rowKey)'
    };

    this._dynamoDBClient.put(params).promise()
        .then(() => {
            deferred.resolve();
        })
        .catch((error: any) => {
            if (error.code === 'ConditionalCheckFailedException') {
                deferred.reject(new Error('App pointer already exists'));
            } else {
                deferred.reject(error);
            }
        });

    return deferred.promise;
}

private removeAppPointer(accountId: string, appId: string): q.Promise<void> {
  const deferred = q.defer<void>();

  const accountPartitionKey: string = Keys.getAccountPartitionKey(accountId);
  const accountRowKey: string = Keys.getHierarchicalAccountRowKey(accountId, appId);

  const params = {
      TableName: AwsStorage.TABLE_NAME,
      Key: {
          partitionKey: accountPartitionKey,
          rowKey: accountRowKey
      },
      // Ensure the item exists before deletion
      ConditionExpression: 'attribute_exists(partitionKey) AND attribute_exists(rowKey)'
  };

  this._dynamoDBClient.delete(params).promise()
      .then(() => {
          deferred.resolve();
      })
      .catch((error: any) => {
          if (error.code === 'ConditionalCheckFailedException') {
              deferred.reject(new Error('App pointer not found'));
          } else {
              deferred.reject(error);
          }
      });

  return deferred.promise;
}

  private removeAllCollaboratorsAppPointers(accountId: string, appId: string): q.Promise<void> {
    return this.getApp(accountId, appId, /*keepCollaboratorIds*/ true)
      .then((app: storage.App) => {
        const collaboratorMap: storage.CollaboratorMap = app.collaborators;
        const requesterEmail: string = AwsStorage.getEmailForAccountId(collaboratorMap, accountId);

        const removalPromises: q.Promise<void>[] = [];

        Object.keys(collaboratorMap).forEach((key: string) => {
          const collabProperties: storage.CollaboratorProperties = collaboratorMap[key];
          removalPromises.push(this.removeAppPointer(collabProperties.accountId, app.id));
        });

        return q.allSettled(removalPromises);
      })
      .then(() => { });
  }

  private updateAppWithPermission(accountId: string, app: storage.App, updateCollaborator: boolean = false): q.Promise<void> {
    const appId: string = app.id;
    if (!appId) throw new Error("No app id");

    const flatApp: any = AwsStorage.flattenApp(app, updateCollaborator);
    return this.mergeByAppHierarchy(flatApp, appId);
  }

  private insertByAppHierarchy(jsObject: Object, appId: string, deploymentId?: string): q.Promise<string> {
    const leafId: string = arguments[arguments.length - 1];
    const appPartitionKey: string = Keys.getAppPartitionKey(appId);

    const args = Array.prototype.slice.call(arguments);
    args.shift(); // Remove 'jsObject' argument
    args.pop(); // Remove the leaf id

    // Check for existence of the parent before inserting
    let fetchParentPromise: q.Promise<void> = q();

    if (args.length > 0) {
      const parentRowKey: string = Keys.getHierarchicalAppRowKey.apply(null, args);
      const parentParams = {
        TableName: AwsStorage.TABLE_NAME,
        Key: {
          partitionKey: appPartitionKey,
          rowKey: parentRowKey
        }
      };

      fetchParentPromise = q.Promise<void>((resolve, reject) => {
        this._dynamoDBClient.get(parentParams).promise()
          .then(result => {
            if (!result.Item) {
              reject(new Error('Parent entity not found'));
            }
            resolve();
          })
          .catch(reject);
      });
    }

    return fetchParentPromise
      .then(() => {
        const appRowKey: string = Keys.getHierarchicalAppRowKey(appId, deploymentId);
        const pointer: Pointer = {
          partitionKeyPointer: appPartitionKey,
          rowKeyPointer: appRowKey
        };

        const entity = this.wrap(jsObject, pointer.partitionKeyPointer, pointer.rowKeyPointer);

        const params = {
          TableName: AwsStorage.TABLE_NAME,
          Item: entity,
          ConditionExpression: 'attribute_not_exists(partitionKey) AND attribute_not_exists(rowKey)'
        };

        return q.Promise<void>((resolve, reject) => {
          this._dynamoDBClient.put(params).promise()
            .then(() => resolve())
            .catch(error => {
              if (error.code === 'ConditionalCheckFailedException') {
                reject(new Error('Entity already exists'));
              }
              reject(error);
            });
        });
      })
      .then(() => leafId)
      .catch(error => {
        throw error;
      });
  }

  private insertAccessKey(accessKey: storage.AccessKey, accountId: string): q.Promise<string> {
    accessKey = storage.clone(accessKey);
    accessKey.name = utils.hashWithSHA256(accessKey.name);

    const deferred = q.defer<string>();

    const partitionKey: string = Keys.getAccountPartitionKey(accountId);
    const rowKey: string = Keys.getAccessKeyRowKey(accountId, accessKey.id);

    const entity: any = this.wrap(accessKey, partitionKey, rowKey);

    const params = {
        TableName: AwsStorage.TABLE_NAME,
        Item: entity,
        ConditionExpression: 'attribute_not_exists(partitionKey) AND attribute_not_exists(rowKey)'
    };

    this._dynamoDBClient.put(params).promise()
        .then(() => {
            deferred.resolve(accessKey.id);
        })
        .catch((error: any) => {
            if (error.code === 'ConditionalCheckFailedException') {
                deferred.reject(new Error('Access key already exists'));
            } else {
                deferred.reject(error);
            }
        });

    return deferred.promise;
}

  private retrieveByKey(partitionKey: string, rowKey: string): q.Promise<any> {
    const params = {
      TableName: AwsStorage.TABLE_NAME,
      Key: {
        partitionKey: partitionKey,
        rowKey: rowKey
      }
    };

    return q.Promise((resolve, reject) => {
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

  private retrieveByAppHierarchy(appId: string, deploymentId?: string): q.Promise<any> {
    const partitionKey: string = Keys.getAppPartitionKey(appId);
    const rowKey: string = Keys.getHierarchicalAppRowKey(appId, deploymentId);
    return this.retrieveByKey(partitionKey, rowKey);
  }

  /**
   * Retrieves a collection of items based on hierarchical structure
   * @param accountId - The account identifier
   * @param appId - Optional application identifier
   * @param deploymentId - Optional deployment identifier
   * @returns Promise resolving to an array of enriched items
   */
  private async getCollectionByHierarchy(
    accountId: string,
    appId?: string,
    deploymentId?: string
  ): Promise<any[]> {
    try {
      // Prepare keys for querying
      const searchKeyArgs = [true, ...Array.from(arguments), ""];
      let partitionKey: string;
      let rowKey: string;
      let childrenSearchKey: string;

      // Determine the keys based on whether appId is provided
      if (appId) {
        searchKeyArgs.splice(1, 1); // remove accountId
        partitionKey = Keys.getAppPartitionKey(appId);
        rowKey = Keys.getHierarchicalAppRowKey(appId, deploymentId);
        childrenSearchKey = Keys.generateHierarchicalAppKey.apply(null, searchKeyArgs);
      } else {
        partitionKey = Keys.getAccountPartitionKey(accountId);
        rowKey = Keys.getHierarchicalAccountRowKey(accountId);
        childrenSearchKey = Keys.generateHierarchicalAccountKey.apply(null, searchKeyArgs);
      }

      // Query parameters for parent record
      const parentParams: AWS.DynamoDB.DocumentClient.QueryInput = {
        TableName: AwsStorage.TABLE_NAME,
        KeyConditionExpression: "partitionKey = :pk AND rowKey = :rk",
        ExpressionAttributeValues: {
          ":pk": partitionKey,
          ":rk": rowKey
        }
      };

      // Query parameters for children records
      const childrenParams: AWS.DynamoDB.DocumentClient.QueryInput = {
        TableName: AwsStorage.TABLE_NAME,
        KeyConditionExpression: "partitionKey = :pk AND rowKey BETWEEN :start AND :end",
        ExpressionAttributeValues: {
          ":pk": partitionKey,
          ":start": childrenSearchKey,
          ":end": childrenSearchKey + "~"
        }
      };

      console.log('childrenParams', childrenParams);

      // Execute both queries concurrently
      const [parentResult, childrenResult] = await Promise.all([
        this._dynamoDBClient.query(parentParams).promise(),
        this._dynamoDBClient.query(childrenParams).promise()
      ]);

      if (!parentResult.Items || parentResult.Items.length === 0) {
        throw new Error('Entity not found');
      }

      // Process and enrich children items
      const enrichedItems = await this.enrichChildrenItems(childrenResult.Items || []);

      console.log('getCollectionByHierarchy final result', enrichedItems);
      return enrichedItems;

    } catch (error) {
      console.error('Error in getCollectionByHierarchy:', error);
      throw error;
    }
  }

  /**
   * Helper method to enrich children items with their pointer references
   * @param items - Array of items to be enriched
   * @returns Promise resolving to array of enriched items
   */
  private async enrichChildrenItems(
    items: AWS.DynamoDB.DocumentClient.ItemList
  ): Promise<any[]> {
    const enrichmentPromises = items.map(async (item) => {
      console.log('getCollectionByHierarchy Item childrenResult', item);

      if (item.partitionKeyPointer && item.rowKeyPointer) {
        const pointerParams: AWS.DynamoDB.DocumentClient.QueryInput = {
          TableName: AwsStorage.TABLE_NAME,
          KeyConditionExpression: "partitionKey = :pk AND rowKey = :rk",
          ExpressionAttributeValues: {
            ":pk": item.partitionKeyPointer,
            ":rk": item.rowKeyPointer
          }
        };

        const pointerResult = await this._dynamoDBClient.query(pointerParams).promise();

        if (pointerResult.Items && pointerResult.Items.length > 0) {
          // Remove pointer fields and merge with referenced item
          const { partitionKeyPointer, rowKeyPointer, ...itemWithoutPointers } = item;
          const enrichedItem = {
            ...itemWithoutPointers,
            ...pointerResult.Items[0]
          };
          return this.unwrap(enrichedItem);
        }
      }

      return this.unwrap(item);
    });

    return Promise.all(enrichmentPromises);
  }

private cleanUpByAppHierarchy(appId: string, deploymentId?: string): q.Promise<void> {
  const deferred = q.defer<void>();
  const partitionKey: string = Keys.getAppPartitionKey(appId);
  const rowKey: string = Keys.getHierarchicalAppRowKey(appId, deploymentId);
  const descendantsSearchKey: string = Keys.generateHierarchicalAppKey(false, appId, deploymentId);

  const queryParams = {
      TableName: AwsStorage.TABLE_NAME,
      KeyConditionExpression: 'partitionKey = :pk and rowKey BETWEEN :start AND :end',
      ExpressionAttributeValues: {
          ':pk': partitionKey,
          ':start': descendantsSearchKey,
          ':end': descendantsSearchKey + '~'
      }
  };

  const processItems = (items: any[]) => {
      const chunks: any[][] = [];
      // Split items into chunks of 25 (DynamoDB batch limit)
      for (let i = 0; i < items.length; i += 25) {
          chunks.push(items.slice(i, i + 25));
      }

      const batchPromises = chunks.map(chunk => {
          const deleteRequests = chunk.map(item => ({
              DeleteRequest: {
                  Key: {
                      partitionKey: item.partitionKey,
                      rowKey: item.rowKey
                  }
              }
          }));

          const batchParams = {
              RequestItems: {
                  [AwsStorage.TABLE_NAME]: deleteRequests
              }
          };

          return this._dynamoDBClient.batchWrite(batchParams).promise();
      });

      return q.all(batchPromises);
  };

  // First query all items
  this._dynamoDBClient.query(queryParams).promise()
      .then(result => {
          if (!result.Items || result.Items.length === 0) {
              return deferred.resolve();
          }

          return processItems(result.Items)
              .then(() => {
                  // Handle pagination if there are more items
                  if (result.LastEvaluatedKey) {
                      const paginatedQuery = {
                          ...queryParams,
                          ExclusiveStartKey: result.LastEvaluatedKey
                      };
                      return this._dynamoDBClient.query(paginatedQuery).promise()
                          .then(nextResult => processItems(nextResult.Items));
                  }
              })
              .then(() => deferred.resolve())
              .catch(error => deferred.reject(error));
      })
      .catch(error => deferred.reject(error));

  return deferred.promise;
}

  private getEntityByAppHierarchy(jsObject: Object, appId: string, deploymentId?: string): any {
    const partitionKey: string = Keys.getAppPartitionKey(appId);
    const rowKey: string = Keys.getHierarchicalAppRowKey(appId, deploymentId);
    return this.wrap(jsObject, partitionKey, rowKey);
  }

  private mergeByAppHierarchy(jsObject: Object, appId: string, deploymentId?: string): q.Promise<void> {
    const deferred = q.defer<void>();
    const entity: any = this.getEntityByAppHierarchy(jsObject, appId, deploymentId);

    // Build update expression and attribute values
    const updateExpressions: string[] = [];
    const expressionAttributeNames: { [key: string]: string } = {};
    const expressionAttributeValues: { [key: string]: any } = {};

    Object.keys(entity).forEach((key, index) => {
        if (key !== 'partitionKey' && key !== 'rowKey') {
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
            rowKey: entity.rowKey
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(partitionKey) AND attribute_exists(rowKey)'
    };

    this._dynamoDBClient.update(params).promise()
        .then(() => {
            deferred.resolve();
        })
        .catch((error: any) => {
            if (error.code === 'ConditionalCheckFailedException') {
                deferred.reject(new Error('Entity does not exist'));
            } else {
                deferred.reject(error);
            }
        });

    return deferred.promise;
}

private updateByAppHierarchy(jsObject: Object, appId: string, deploymentId?: string): q.Promise<void> {
  const deferred = q.defer<void>();
  const entity: any = this.getEntityByAppHierarchy(jsObject, appId, deploymentId);

  // Build update expressions
  const updateExpressions: string[] = [];
  const expressionAttributeNames: { [key: string]: string } = {};
  const expressionAttributeValues: { [key: string]: any } = {};

  Object.keys(entity).forEach((key, index) => {
      if (key !== 'partitionKey' && key !== 'rowKey') {
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
          rowKey: entity.rowKey
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression: 'attribute_exists(partitionKey) AND attribute_exists(rowKey)'
  };

  this._dynamoDBClient.update(params).promise()
      .then(() => {
          deferred.resolve();
      })
      .catch((error: any) => {
          if (error.code === 'ConditionalCheckFailedException') {
              deferred.reject(new Error('Entity does not exist'));
          } else {
              deferred.reject(error);
          }
      });

  return deferred.promise;
}

  private getNextLabel(packageHistory: storage.Package[]): string {
    if (packageHistory.length === 0) {
      return "v1";
    }

    const lastLabel: string = packageHistory[packageHistory.length - 1].label;
    const lastVersion: number = parseInt(lastLabel.substring(1)); // Trim 'v' from the front
    return "v" + (lastVersion + 1);
  }

  private static awsErrorHandler(
    awsError: any,
    overrideMessage: boolean = false,
    overrideCondition?: string,
    overrideValue?: string
): any {
    let errorCodeRaw: string;
    let errorMessage: string;

    // Extract error details from AWS error
    try {
        errorCodeRaw = awsError.code || awsError.name;
        errorMessage = awsError.message;
    } catch (error) {
        errorCodeRaw = 'UnknownError';
        errorMessage = awsError.toString();
    }

    if (overrideMessage && overrideCondition === errorCodeRaw) {
        errorMessage = overrideValue;
    }

    // Map AWS error codes to storage error codes
    let errorCode: storage.ErrorCode;
    switch (errorCodeRaw) {
        // DynamoDB Errors
        case 'ResourceNotFoundException':
        case 'NoSuchKey':               // S3
        case 'NotFound':
            errorCode = storage.ErrorCode.NotFound;
            break;

        case 'ConditionalCheckFailedException':
        case 'ResourceInUseException':
            errorCode = storage.ErrorCode.AlreadyExists;
            break;

        case 'ItemCollectionSizeLimitExceededException':
        case 'EntityTooLarge':          // S3
            errorCode = storage.ErrorCode.TooLarge;
            break;

        // Connection/Network Errors
        case 'NetworkingError':
        case 'TimeoutError':
        case 'RequestTimeout':
        case 'RequestTimeoutException':
            errorCode = storage.ErrorCode.ConnectionFailed;
            break;

        // Authentication/Authorization
        case 'UnauthorizedOperation':
        case 'AccessDeniedException':
        case 'InvalidAccessKeyId':
        case 'SignatureDoesNotMatch':
            errorCode = storage.ErrorCode.Unauthorized;
            break;

        // Throttling
        case 'ProvisionedThroughputExceededException':
        case 'ThrottlingException':
            errorCode = storage.ErrorCode.ThrottlingError;
            break;

        // Service errors
        case 'InternalServerError':
        case 'ServiceUnavailable':
            errorCode = storage.ErrorCode.ServiceError;
            break;

        // Validation errors
        case 'ValidationException':
        case 'InvalidParameterException':
            errorCode = storage.ErrorCode.ValidationError;
            break;

        default:
            errorCode = storage.ErrorCode.Other;
            break;
    }

    throw storage.storageError(errorCode, errorMessage);
}

  private static deleteIsCurrentAccountProperty(map: storage.CollaboratorMap): void {
    if (map) {
      Object.keys(map).forEach((key: string) => {
        delete (<storage.CollaboratorProperties>map[key]).isCurrentAccount;
      });
    }
  }

  private static flattenApp(app: storage.App, updateCollaborator: boolean = false): any {
    if (!app) {
      return app;
    }

    const flatApp: any = {};
    for (const property in app) {
      if (property === "collaborators" && updateCollaborator) {
        AwsStorage.deleteIsCurrentAccountProperty(app.collaborators);
        flatApp[property] = JSON.stringify((<any>app)[property]);
      } else if (property !== "collaborators") {
        // No-op updates on these properties
        flatApp[property] = (<any>app)[property];
      }
    }

    return flatApp;
  }

  // Note: This does not copy the object before unflattening it
  private static unflattenApp(flatApp: any, currentAccountId: string): storage.App {
    flatApp.collaborators = flatApp.collaborators ? JSON.parse(flatApp.collaborators) : {};

    const currentUserEmail: string = AwsStorage.getEmailForAccountId(flatApp.collaborators, currentAccountId);
    if (currentUserEmail && flatApp.collaborators[currentUserEmail]) {
      flatApp.collaborators[currentUserEmail].isCurrentAccount = true;
    }

    return flatApp;
  }

  private static flattenDeployment(deployment: storage.Deployment): any {
    if (!deployment) {
      return deployment;
    }

    const flatDeployment: any = {};
    for (const property in deployment) {
      if (property !== "package") {
        // No-op updates on these properties
        flatDeployment[property] = (<any>deployment)[property];
      }
    }

    return flatDeployment;
  }

  // Note: This does not copy the object before unflattening it
  private static unflattenDeployment(flatDeployment: any): storage.Deployment {
    delete flatDeployment.packageHistory;
    flatDeployment.package = flatDeployment.package ? JSON.parse(flatDeployment.package) : null;

    return flatDeployment;
  }

  private static isOwner(collaboratorsMap: storage.CollaboratorMap, email: string): boolean {
    return (
      collaboratorsMap &&
      email &&
      collaboratorsMap[email] &&
      (<storage.CollaboratorProperties>collaboratorsMap[email]).permission === storage.Permissions.Owner
    );
  }

  private static isCollaborator(collaboratorsMap: storage.CollaboratorMap, email: string): boolean {
    return (
      collaboratorsMap &&
      email &&
      collaboratorsMap[email] &&
      (<storage.CollaboratorProperties>collaboratorsMap[email]).permission === storage.Permissions.Collaborator
    );
  }

  private static setCollaboratorPermission(collaboratorsMap: storage.CollaboratorMap, email: string, permission: string): void {
    if (collaboratorsMap && email && !isPrototypePollutionKey(email) && collaboratorsMap[email]) {
      (<storage.CollaboratorProperties>collaboratorsMap[email]).permission = permission;
    }
  }

  private static addToCollaborators(
    collaboratorsMap: storage.CollaboratorMap,
    email: string,
    collabProps: storage.CollaboratorProperties
  ): void {
    if (collaboratorsMap && email && !isPrototypePollutionKey(email) && !collaboratorsMap[email]) {
      collaboratorsMap[email] = collabProps;
    }
  }

  private static getEmailForAccountId(collaboratorsMap: storage.CollaboratorMap, accountId: string): string {
    if (collaboratorsMap) {
      for (const email of Object.keys(collaboratorsMap)) {
        if ((<storage.CollaboratorProperties>collaboratorsMap[email]).accountId === accountId) {
          return email;
        }
      }
    }

    return null;
  }
}
