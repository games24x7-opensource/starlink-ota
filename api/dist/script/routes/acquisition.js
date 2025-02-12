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
exports.getHealthRouter = getHealthRouter;
exports.getAcquisitionRouter = getAcquisitionRouter;
const express_1 = __importDefault(require("express"));
const semver_1 = __importDefault(require("semver"));
const q_1 = __importDefault(require("q"));
const querystring_1 = __importDefault(require("querystring"));
const url_1 = __importDefault(require("url"));
const utils = __importStar(require("../utils/common"));
const acquisitionUtils = __importStar(require("../utils/acquisition"));
const errorUtils = __importStar(require("../utils/rest-error-handling"));
const redis = __importStar(require("../redis-manager"));
const restHeaders = __importStar(require("../utils/rest-headers"));
const rolloutSelector = __importStar(require("../utils/rollout-selector"));
const validation_1 = __importDefault(require("../utils/validation"));
const Logger = require("../logger");
const METRICS_BREAKING_VERSION = "1.5.2-beta";
function getUrlKey(originalUrl) {
    const obj = url_1.default.parse(originalUrl, /*parseQueryString*/ true);
    delete obj.query.clientUniqueId;
    return obj.pathname + "?" + querystring_1.default.stringify(obj.query);
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
    if (validation_1.default.isValidUpdateCheckRequest(updateRequest)) {
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
            return (0, q_1.default)(cacheableResponse);
        });
    }
    else {
        if (!validation_1.default.isValidKeyField(updateRequest.deploymentKey)) {
            errorUtils.sendMalformedRequestError(res, "An update check must include a valid deployment key - please check that your app has been " +
                "configured correctly. To view available deployment keys, run 'code-push-standalone deployment ls <appName> -k'.");
        }
        else if (!validation_1.default.isValidAppVersionField(updateRequest.appVersion)) {
            errorUtils.sendMalformedRequestError(res, "An update check must include a binary version that conforms to the semver standard (e.g. '1.0.0'). " +
                "The binary version is normally inferred from the App Store/Play Store version configured with your app.");
        }
        else {
            errorUtils.sendMalformedRequestError(res, "An update check must include a valid deployment key and provide a semver-compliant app version.");
        }
        return (0, q_1.default)(null);
    }
}
function getHealthRouter(config) {
    const storage = config.storage;
    const redisManager = config.redisManager;
    const router = express_1.default.Router();
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
    const router = express_1.default.Router();
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
                return (0, q_1.default)(null);
            })
                .then((cachedResponse) => {
                fromCache = !!cachedResponse;
                return cachedResponse || createResponseUsingStorage(req, res, storage);
            })
                .then((response) => {
                if (!response) {
                    return (0, q_1.default)(null);
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
                Logger.instance("[Starlink::OTA::updateCheck")
                    .setExpressReq(req)
                    .setUpstreamRequestParams({
                    deploymentKey,
                    clientUniqueId,
                    url,
                    appVersion: req.query.appVersion || req.query.app_version,
                    packageHash: req.query.packageHash || req.query.package_hash,
                    isCompanion: req.query.isCompanion || req.query.is_companion,
                    label: req.query.label,
                })
                    .setUpstreamResponse(updateCheckBody)
                    .log();
                res.status(response.statusCode).send(newApi ? utils.convertObjectToSnakeCase(updateCheckBody) : updateCheckBody);
                // Update REDIS cache after sending the response so that we don't block the request.
                if (!fromCache) {
                    return redisManager.setCachedResponse(key, url, response);
                }
            })
                .then(() => {
                if (redisError) {
                    Logger.instance("[Starlink::OTA::updateCheck::redisError").setExpressReq(req).setError(redisError).log();
                    throw redisError;
                }
            })
                .catch((error) => {
                Logger.instance("[Starlink::OTA::updateCheck::StorageError").setExpressReq(req).setError(error).log();
                return errorUtils.restErrorHandler(res, error, next);
            });
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
        if (semver_1.default.valid(sdkVersion) && semver_1.default.gte(sdkVersion, METRICS_BREAKING_VERSION)) {
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
                Logger.instance("[Starlink::OTA::reportStatusDeploy::success")
                    .setExpressReq(req)
                    .setUpstreamRequestParams({
                    deploymentKey,
                    clientUniqueId,
                    appVersion,
                    previousDeploymentKey,
                    previousLabelOrAppVersion,
                    status: req.body.status,
                })
                    .log();
                res.sendStatus(200);
                if (clientUniqueId) {
                    redisManager.removeDeploymentKeyClientActiveLabel(previousDeploymentKey, clientUniqueId);
                }
            })
                .catch((error) => {
                Logger.instance("[Starlink::OTA::reportStatusDeploy::error").setExpressReq(req).setError(error).log();
                errorUtils.sendUnknownError(res, error, next);
            })
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
                Logger.instance("[Starlink::OTA::reportStatusDeploy::success")
                    .setExpressReq(req)
                    .setUpstreamRequestParams({
                    deploymentKey,
                    clientUniqueId,
                    appVersion,
                    previousDeploymentKey,
                    previousLabelOrAppVersion,
                    status: req.body.status,
                })
                    .log();
                res.sendStatus(200);
            })
                .catch((error) => {
                Logger.instance("[Starlink::OTA::reportStatusDeploy::error").setExpressReq(req).setError(error).log();
                errorUtils.sendUnknownError(res, error, next);
            })
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
            Logger.instance("[Starlink::OTA::reportStatusDownload::success")
                .setExpressReq(req)
                .setUpstreamRequestParams({
                deploymentKey,
                label: req.body.label,
            })
                .log();
            res.sendStatus(200);
        })
            .catch((error) => {
            Logger.instance("[Starlink::OTA::reportStatusDownload::error").setExpressReq(req).setError(error).log();
            errorUtils.sendUnknownError(res, error, next);
        })
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
//# sourceMappingURL=acquisition.js.map