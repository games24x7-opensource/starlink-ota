"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHealthRouter = getHealthRouter;
exports.getAcquisitionRouter = getAcquisitionRouter;
const express = require("express");
const semver = require("semver");
const utils = require("../utils/common");
const acquisitionUtils = require("../utils/acquisition");
const errorUtils = require("../utils/rest-error-handling");
const redis = require("../redis-manager");
const restHeaders = require("../utils/rest-headers");
const rolloutSelector = require("../utils/rollout-selector");
const validationUtils = require("../utils/validation");
const q = require("q");
const queryString = require("querystring");
const URL = require("url");
const METRICS_BREAKING_VERSION = "1.5.2-beta";
function getUrlKey(originalUrl) {
    const obj = URL.parse(originalUrl, /*parseQueryString*/ true);
    delete obj.query.clientUniqueId;
    return obj.pathname + "?" + queryString.stringify(obj.query);
}
function createResponseUsingStorage(req, res, storage) {
    const deploymentKey = String(req.query.deploymentKey || req.query.deployment_key);
    const appVersion = String(req.query.appVersion || req.query.app_version);
    const packageHash = String(req.query.packageHash || req.query.package_hash);
    const isCompanion = String(req.query.isCompanion || req.query.is_companion);
    const updateRequest = {
        deploymentKey: deploymentKey,
        appVersion: appVersion,
        packageHash: packageHash,
        isCompanion: isCompanion && isCompanion.toLowerCase() === "true",
        label: String(req.query.label),
    };
    let originalAppVersion;
    // Make an exception to allow plain integer numbers e.g. "1", "2" etc.
    const isPlainIntegerNumber = /^\d+$/.test(updateRequest.appVersion);
    if (isPlainIntegerNumber) {
        originalAppVersion = updateRequest.appVersion;
        updateRequest.appVersion = originalAppVersion + ".0.0";
    }
    // Make an exception to allow missing patch versions e.g. "2.0" or "2.0-prerelease"
    const isMissingPatchVersion = /^\d+\.\d+([\+\-].*)?$/.test(updateRequest.appVersion);
    if (isMissingPatchVersion) {
        originalAppVersion = updateRequest.appVersion;
        const semverTagIndex = originalAppVersion.search(/[\+\-]/);
        if (semverTagIndex === -1) {
            updateRequest.appVersion += ".0";
        }
        else {
            updateRequest.appVersion = originalAppVersion.slice(0, semverTagIndex) + ".0" + originalAppVersion.slice(semverTagIndex);
        }
    }
    if (validationUtils.isValidUpdateCheckRequest(updateRequest)) {
        return storage.getPackageHistoryFromDeploymentKey(updateRequest.deploymentKey).then((packageHistory) => {
            const updateObject = acquisitionUtils.getUpdatePackageInfo(packageHistory, updateRequest);
            if ((isMissingPatchVersion || isPlainIntegerNumber) && updateObject.originalPackage.appVersion === updateRequest.appVersion) {
                // Set the appVersion of the response to the original one with the missing patch version or plain number
                updateObject.originalPackage.appVersion = originalAppVersion;
                if (updateObject.rolloutPackage) {
                    updateObject.rolloutPackage.appVersion = originalAppVersion;
                }
            }
            const cacheableResponse = {
                statusCode: 200,
                body: updateObject,
            };
            return q(cacheableResponse);
        });
    }
    else {
        if (!validationUtils.isValidKeyField(updateRequest.deploymentKey)) {
            errorUtils.sendMalformedRequestError(res, "An update check must include a valid deployment key - please check that your app has been " +
                "configured correctly. To view available deployment keys, run 'code-push-standalone deployment ls <appName> -k'.");
        }
        else if (!validationUtils.isValidAppVersionField(updateRequest.appVersion)) {
            errorUtils.sendMalformedRequestError(res, "An update check must include a binary version that conforms to the semver standard (e.g. '1.0.0'). " +
                "The binary version is normally inferred from the App Store/Play Store version configured with your app.");
        }
        else {
            errorUtils.sendMalformedRequestError(res, "An update check must include a valid deployment key and provide a semver-compliant app version.");
        }
        return q(null);
    }
}
function getHealthRouter(config) {
    const storage = config.storage;
    const redisManager = config.redisManager;
    const router = express.Router();
    router.get("/health", (req, res, next) => {
        storage
            .checkHealth()
            .then(() => {
            return redisManager.checkHealth();
        })
            .then(() => {
            res.status(200).send("Healthy");
        })
            .catch((error) => errorUtils.sendUnknownError(res, error, next))
            .done();
    });
    return router;
}
function getAcquisitionRouter(config) {
    const storage = config.storage;
    const redisManager = config.redisManager;
    const router = express.Router();
    const updateCheck = function (newApi) {
        return function (req, res, next) {
            const deploymentKey = String(req.query.deploymentKey || req.query.deployment_key);
            const key = redis.Utilities.getDeploymentKeyHash(deploymentKey);
            const clientUniqueId = String(req.query.clientUniqueId || req.query.client_unique_id);
            const url = getUrlKey(req.originalUrl);
            let fromCache = true;
            let redisError;
            redisManager
                .getCachedResponse(key, url)
                .catch((error) => {
                // Store the redis error to be thrown after we send response.
                redisError = error;
                return q(null);
            })
                .then((cachedResponse) => {
                fromCache = !!cachedResponse;
                return cachedResponse || createResponseUsingStorage(req, res, storage);
            })
                .then((response) => {
                if (!response) {
                    return q(null);
                }
                let giveRolloutPackage = false;
                const cachedResponseObject = response.body;
                if (cachedResponseObject.rolloutPackage && clientUniqueId) {
                    const releaseSpecificString = cachedResponseObject.rolloutPackage.label || cachedResponseObject.rolloutPackage.packageHash;
                    giveRolloutPackage = rolloutSelector.isSelectedForRollout(clientUniqueId, cachedResponseObject.rollout, releaseSpecificString);
                }
                const updateCheckBody = {
                    updateInfo: giveRolloutPackage ? cachedResponseObject.rolloutPackage : cachedResponseObject.originalPackage,
                };
                // Change in new API
                updateCheckBody.updateInfo.target_binary_range = updateCheckBody.updateInfo.appVersion;
                res.locals.fromCache = fromCache;
                res.status(response.statusCode).send(newApi ? utils.convertObjectToSnakeCase(updateCheckBody) : updateCheckBody);
                // Update REDIS cache after sending the response so that we don't block the request.
                if (!fromCache) {
                    return redisManager.setCachedResponse(key, url, response);
                }
            })
                .then(() => {
                if (redisError) {
                    throw redisError;
                }
            })
                .catch((error) => errorUtils.restErrorHandler(res, error, next))
                .done();
        };
    };
    const reportStatusDeploy = function (req, res, next) {
        const deploymentKey = req.body.deploymentKey || req.body.deployment_key;
        const appVersion = req.body.appVersion || req.body.app_version;
        const previousDeploymentKey = req.body.previousDeploymentKey || req.body.previous_deployment_key || deploymentKey;
        const previousLabelOrAppVersion = req.body.previousLabelOrAppVersion || req.body.previous_label_or_app_version;
        const clientUniqueId = req.body.clientUniqueId || req.body.client_unique_id;
        if (!deploymentKey || !appVersion) {
            return errorUtils.sendMalformedRequestError(res, "A deploy status report must contain a valid appVersion and deploymentKey.");
        }
        else if (req.body.label) {
            if (!req.body.status) {
                return errorUtils.sendMalformedRequestError(res, "A deploy status report for a labelled package must contain a valid status.");
            }
            else if (!redis.Utilities.isValidDeploymentStatus(req.body.status)) {
                return errorUtils.sendMalformedRequestError(res, "Invalid status: " + req.body.status);
            }
        }
        const sdkVersion = restHeaders.getSdkVersion(req);
        if (semver.valid(sdkVersion) && semver.gte(sdkVersion, METRICS_BREAKING_VERSION)) {
            // If previousDeploymentKey not provided, assume it is the same deployment key.
            let redisUpdatePromise;
            if (req.body.label && req.body.status === redis.DEPLOYMENT_FAILED) {
                redisUpdatePromise = redisManager.incrementLabelStatusCount(deploymentKey, req.body.label, req.body.status);
            }
            else {
                const labelOrAppVersion = req.body.label || appVersion;
                redisUpdatePromise = redisManager.recordUpdate(deploymentKey, labelOrAppVersion, previousDeploymentKey, previousLabelOrAppVersion);
            }
            redisUpdatePromise
                .then(() => {
                res.sendStatus(200);
                if (clientUniqueId) {
                    redisManager.removeDeploymentKeyClientActiveLabel(previousDeploymentKey, clientUniqueId);
                }
            })
                .catch((error) => errorUtils.sendUnknownError(res, error, next))
                .done();
        }
        else {
            if (!clientUniqueId) {
                return errorUtils.sendMalformedRequestError(res, "A deploy status report must contain a valid appVersion, clientUniqueId and deploymentKey.");
            }
            return redisManager
                .getCurrentActiveLabel(deploymentKey, clientUniqueId)
                .then((currentVersionLabel) => {
                if (req.body.label && req.body.label !== currentVersionLabel) {
                    return redisManager.incrementLabelStatusCount(deploymentKey, req.body.label, req.body.status).then(() => {
                        if (req.body.status === redis.DEPLOYMENT_SUCCEEDED) {
                            return redisManager.updateActiveAppForClient(deploymentKey, clientUniqueId, req.body.label, currentVersionLabel);
                        }
                    });
                }
                else if (!req.body.label && appVersion !== currentVersionLabel) {
                    return redisManager.updateActiveAppForClient(deploymentKey, clientUniqueId, appVersion, appVersion);
                }
            })
                .then(() => {
                res.sendStatus(200);
            })
                .catch((error) => errorUtils.sendUnknownError(res, error, next))
                .done();
        }
    };
    const reportStatusDownload = function (req, res, next) {
        const deploymentKey = req.body.deploymentKey || req.body.deployment_key;
        if (!req.body || !deploymentKey || !req.body.label) {
            return errorUtils.sendMalformedRequestError(res, "A download status report must contain a valid deploymentKey and package label.");
        }
        return redisManager
            .incrementLabelStatusCount(deploymentKey, req.body.label, redis.DOWNLOADED)
            .then(() => {
            res.sendStatus(200);
        })
            .catch((error) => errorUtils.sendUnknownError(res, error, next))
            .done();
    };
    router.get("/updateCheck", updateCheck(false));
    router.get("/v0.1/public/codepush/update_check", updateCheck(true));
    router.post("/reportStatus/deploy", reportStatusDeploy);
    router.post("/v0.1/public/codepush/report_status/deploy", reportStatusDeploy);
    router.post("/reportStatus/download", reportStatusDownload);
    router.post("/v0.1/public/codepush/report_status/download", reportStatusDownload);
    return router;
}
