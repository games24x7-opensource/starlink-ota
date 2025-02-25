// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import express from "express";
import q from "q";
import queryString from "querystring";
import URL from "url";

import * as utils from "../utils/common";
import * as acquisitionUtils from "../utils/acquisition";
import * as errorUtils from "../utils/rest-error-handling";
import * as redis from "../redis-manager";
import * as rolloutSelector from "../utils/rollout-selector";
import * as storageTypes from "../storage/storage";
import { UpdateCheckCacheResponse, UpdateCheckRequest, UpdateCheckResponse } from "../types/rest-definitions";
import validationUtils from "../utils/validation";
const Logger = require("../logger");

import Promise = q.Promise;
import { acquisitionInputSanitizer } from "./input-sanitizer";

// const METRICS_BREAKING_VERSION = "1.5.2-beta";

export interface AcquisitionConfig {
  storage: storageTypes.Storage;
  redisManager: redis.RedisManager;
}

function getUrlKey(originalUrl: string): string {
  const obj: any = URL.parse(originalUrl, /*parseQueryString*/ true);
  delete obj.query.clientUniqueId;
  return obj.pathname + "?" + queryString.stringify(obj.query);
}

function createResponseUsingStorage(
  req: express.Request,
  res: express.Response,
  storage: storageTypes.Storage
): Promise<redis.CacheableResponse> {
  const deploymentKey: string = String(req.query.deploymentKey || req.query.deployment_key);
  const appVersion: string = String(req.query.appVersion || req.query.app_version);
  const packageHash: string = String(req.query.packageHash || req.query.package_hash);
  const isCompanion: string = String(req.query.isCompanion || req.query.is_companion);

  const updateRequest: UpdateCheckRequest = {
    deploymentKey: deploymentKey,
    appVersion: appVersion,
    packageHash: packageHash,
    isCompanion: isCompanion && isCompanion.toLowerCase() === "true",
    label: String(req.query.label),
  };

  let originalAppVersion: string;

  // Make an exception to allow plain integer numbers e.g. "1", "2" etc.
  const isPlainIntegerNumber: boolean = /^\d+$/.test(updateRequest.appVersion);
  if (isPlainIntegerNumber) {
    originalAppVersion = updateRequest.appVersion;
    updateRequest.appVersion = originalAppVersion + ".0.0";
  }

  // Make an exception to allow missing patch versions e.g. "2.0" or "2.0-prerelease"
  const isMissingPatchVersion: boolean = /^\d+\.\d+([\+\-].*)?$/.test(updateRequest.appVersion);
  if (isMissingPatchVersion) {
    originalAppVersion = updateRequest.appVersion;
    const semverTagIndex = originalAppVersion.search(/[\+\-]/);
    if (semverTagIndex === -1) {
      updateRequest.appVersion += ".0";
    } else {
      updateRequest.appVersion = originalAppVersion.slice(0, semverTagIndex) + ".0" + originalAppVersion.slice(semverTagIndex);
    }
  }

  Logger.info("[Starlink::OTA::updateCheck::createResponseUsingStorage")
    .setExpressReq(req)
    .setData({
      updateRequest,
    })
    .log();

  if (validationUtils.isValidUpdateCheckRequest(updateRequest)) {
    return storage
      .getPackageHistoryFromDeploymentKey(updateRequest.deploymentKey)
      .then((packageHistory: storageTypes.Package[]) => {
        const updateObject: UpdateCheckCacheResponse = acquisitionUtils.getUpdatePackageInfo(packageHistory, updateRequest);
        if ((isMissingPatchVersion || isPlainIntegerNumber) && updateObject.originalPackage.appVersion === updateRequest.appVersion) {
          // Set the appVersion of the response to the original one with the missing patch version or plain number
          updateObject.originalPackage.appVersion = originalAppVersion;
          if (updateObject.rolloutPackage) {
            updateObject.rolloutPackage.appVersion = originalAppVersion;
          }
        }

        Logger.info("[Starlink::OTA::updateCheck::createResponseUsingStorage] success in getPackageHistoryFromDeploymentKey")
          .setExpressReq(req)
          .setData({
            updateRequest,
            updateObject,
          })
          .log();

        const cacheableResponse: redis.CacheableResponse = {
          statusCode: 200,
          body: updateObject,
        };

        return q(cacheableResponse);
      })
      .catch((error: any) => {
        // Handle all storage errors as deployment key errors
        Logger.error("[Starlink::OTA::updateCheck::StorageError] Invalid or missing deployment")
          .setExpressReq(req)
          .setData({ updateRequest })
          .log();

        errorUtils.sendMalformedRequestError(res, "Invalid deployment key");
        return null;
      });
  } else {
    if (!validationUtils.isValidKeyField(updateRequest.deploymentKey)) {
      Logger.error("[Starlink::OTA::updateCheck::createResponseUsingStorage] An update check must include a valid deployment key")
        .setExpressReq(req)
        .setData({
          updateRequest,
        })
        .log();

      errorUtils.sendMalformedRequestError(res, "An update check must include a valid deployment key");
    } else if (!validationUtils.isValidAppVersionField(updateRequest.appVersion)) {
      Logger.error("[Starlink::OTA::updateCheck::createResponseUsingStorage] An update check must include appVersion")
        .setExpressReq(req)
        .setData({
          updateRequest,
        })
        .log();

      errorUtils.sendMalformedRequestError(res, "An update check must include appVersion");
    } else {
      Logger.error(
        "[Starlink::OTA::updateCheck::createResponseUsingStorage] An update check must include a valid deployment key and provide a semver-compliant app version."
      )
        .setExpressReq(req)
        .setData({
          updateRequest,
        })
        .log();

      errorUtils.sendMalformedRequestError(
        res,
        "An update check must include a valid deployment key and provide a semver-compliant app version."
      );
    }

    return q<redis.CacheableResponse>(null);
  }
}

export function getHealthRouter(config: AcquisitionConfig): express.Router {
  const storage: storageTypes.Storage = config.storage;
  const redisManager: redis.RedisManager = config.redisManager;
  const router: express.Router = express.Router();

  router.get("/health", (req: express.Request, res: express.Response, next: (err?: any) => void): any => {
    storage
      .checkHealth()
      .then(() => {
        return redisManager.checkHealth();
      })
      .then(() => {
        res.status(200).send("Healthy");
      })
      .catch((error: Error) => errorUtils.sendUnknownError(res, error, next))
      .done();
  });

  return router;
}

export function getAcquisitionRouter(config: AcquisitionConfig): express.Router {
  const storage: storageTypes.Storage = config.storage;
  const redisManager: redis.RedisManager = config.redisManager;
  const router: express.Router = express.Router();

  const updateCheck = function (newApi: boolean) {
    return function (req: express.Request, res: express.Response, next: (err?: any) => void) {
      const appVersion: string = String(req.query.appVersion || req.query.app_version);
      const deploymentKey: string = String(req.query.deploymentKey || req.query.deployment_key);
      const key: string = redis.Utilities.getDeploymentKeyHash(deploymentKey);
      const clientUniqueId: string = String(req.query.clientUniqueId || req.query.client_unique_id);
      const url: string = getUrlKey(req.originalUrl);

      // Without clientUniqueId, deploymentKey we can't proceed with update check
      // so we are returning 400 error immediately: check for "undefined" cause String(undefined) === "undefined"
      if (deploymentKey === "undefined" || clientUniqueId === "undefined" || appVersion === "undefined") {
        Logger.error("[Starlink::OTA::updateCheck - UpdateCheck must contain a valid clientUniqueId, deploymentKey and appVersion.")
          .setExpressReq(req)
          .setData({
            deploymentKey,
            clientUniqueId,
          })
          .log();

        return errorUtils.sendMalformedRequestError(
          res,
          "UpdateCheck must contain a valid clientUniqueId, deploymentKey and appVersion."
        );
      }

      

      let requestQueryParams = req.query || {};
      let fromCache: boolean = true;
      let redisError: Error;

      redisManager
        .getCachedResponse(key, url)
        .catch((error: Error) => {
          // Store the redis error to be thrown after we send response.
          redisError = error;
          return q<redis.CacheableResponse>(null);
        })
        .then((cachedResponse: redis.CacheableResponse) => {
          fromCache = !!cachedResponse;
          return cachedResponse || createResponseUsingStorage(req, res, storage);
        })
        .then((response: redis.CacheableResponse) => {
          if (!response) {
            return q<void>(null);
          }

          let giveRolloutPackage: boolean = false;
          const cachedResponseObject = <UpdateCheckCacheResponse>response.body;
          if (cachedResponseObject.rolloutPackage && clientUniqueId) {
            const releaseSpecificString: string =
              cachedResponseObject.rolloutPackage.label || cachedResponseObject.rolloutPackage.packageHash;
            giveRolloutPackage = rolloutSelector.isSelectedForRollout(
              clientUniqueId,
              cachedResponseObject.rollout,
              releaseSpecificString
            );
          }

          const updateCheckBody: { updateInfo: UpdateCheckResponse } = {
            updateInfo: giveRolloutPackage ? cachedResponseObject.rolloutPackage : cachedResponseObject.originalPackage,
          };

          // Change in new API
          updateCheckBody.updateInfo.target_binary_range = updateCheckBody.updateInfo.appVersion;
          res.locals.fromCache = fromCache;

          Logger.info("[Starlink::OTA::updateCheck")
            .setExpressReq(req)
            .setData({
              deploymentKey,
              clientUniqueId,
              url,
              requestQueryParams,
              updateCheckBody,
              fromCache,
            })
            .log();

          res.status(response.statusCode).send(newApi ? utils.convertObjectToSnakeCase(updateCheckBody) : updateCheckBody);

          // Update REDIS cache after sending the response so that we don't block the request.
          if (!fromCache) {
            return redisManager.setCachedResponse(key, url, response);
          }
        })
        .then(() => {
          if (redisError) {
            Logger.error("[Starlink::OTA::updateCheck::redisError").setExpressReq(req).setError(redisError).log();
            //exception handled in catch block
            throw redisError;
          }
        })
        .catch((error: storageTypes.StorageError) => {
          Logger.error("[Starlink::OTA::updateCheck::StorageError").setExpressReq(req).setError(error).log();
          return errorUtils.restErrorHandler(res, error, next);
        });
    };
  };

  const reportStatusDeploy = function (req: express.Request, res: express.Response, next: (err?: any) => void) {
    const deploymentKey = req.body?.deploymentKey || req.body?.deployment_key;
    const appVersion = req.body?.appVersion || req.body?.app_version;
    const previousDeploymentKey = req.body?.previousDeploymentKey || req.body?.previous_deployment_key || deploymentKey;
    const previousLabelOrAppVersion = req.body.previousLabelOrAppVersion || req.body.previous_label_or_app_version;
    const clientUniqueId = req.body.clientUniqueId || req.body.client_unique_id;

    const labelOrAppVersion: string = req.body.label || appVersion;

    if (!deploymentKey || !appVersion) {
      Logger.error("[Starlink::OTA::reportStatusDeploy - A deploy status report must contain a valid appVersion and deploymentKey.")
        .setExpressReq(req)
        .setData({
          deploymentKey,
          clientUniqueId,
          appVersion,
          labelOrAppVersion,
          previousDeploymentKey,
          previousLabelOrAppVersion,
        })
        .log();

      return errorUtils.sendMalformedRequestError(res, "A deploy status report must contain a valid appVersion and deploymentKey.");
    } else if (req.body.label) {
      if (!req.body.status) {
        Logger.error("[Starlink::OTA::reportStatusDeploy - A deploy status report for a labelled package must contain a valid status.")
          .setExpressReq(req)
          .setData({
            deploymentKey,
            clientUniqueId,
            appVersion,
            labelOrAppVersion,
            previousDeploymentKey,
            previousLabelOrAppVersion,
          })
          .log();

        return errorUtils.sendMalformedRequestError(res, "A deploy status report for a labelled package must contain a valid status.");
      } else if (!redis.Utilities.isValidDeploymentStatus(req.body.status)) {
        Logger.error("[Starlink::OTA::reportStatusDeploy - Invalid status: " + req.body.status)
          .setExpressReq(req)
          .setData({
            deploymentKey,
            clientUniqueId,
            appVersion,
            labelOrAppVersion,
            previousDeploymentKey,
            previousLabelOrAppVersion,
          })
          .log();

        return errorUtils.sendMalformedRequestError(res, "Invalid status: " + req.body.status);
      }
    }

    // If previousDeploymentKey not provided, assume it is the same deployment key.
    let redisUpdatePromise: q.Promise<void>;

    if (req.body.label && req.body.status === redis.DEPLOYMENT_FAILED) {
      redisUpdatePromise = redisManager.incrementLabelStatusCount(deploymentKey, req.body.label, req.body.status);
    } else {
      redisUpdatePromise = redisManager.recordUpdate(
        deploymentKey,
        labelOrAppVersion,
        previousDeploymentKey,
        previousLabelOrAppVersion
      );
    }

    redisUpdatePromise
      .then(() => {
        Logger.info("[Starlink::OTA::reportStatusDeploy::success")
          .setExpressReq(req)
          .setData({
            deploymentKey,
            clientUniqueId,
            appVersion,
            labelOrAppVersion,
            previousDeploymentKey,
            previousLabelOrAppVersion,
            status: req.body.status,
          })
          .log();

        res.sendStatus(200);
      })
      .catch((error: any) => {
        Logger.error("[Starlink::OTA::reportStatusDeploy::error")
          .setExpressReq(req)
          .setError(error)
          .setData({
            deploymentKey,
            clientUniqueId,
            appVersion,
            labelOrAppVersion,
            previousDeploymentKey,
            previousLabelOrAppVersion,
            status: req.body.status,
          })
          .log();

        errorUtils.sendUnknownError(res, error, next);
      })
      .done();
  };

  const reportStatusDownload = function (req: express.Request, res: express.Response, next: (err?: any) => void) {
    const deploymentKey = req.body?.deploymentKey || req.body?.deployment_key;

    if (!req.body || !deploymentKey || !req.body?.label) {
      Logger.error(
        "[Starlink::OTA::reportStatusDownload::error] - A download status report must contain a valid deploymentKey and package label."
      )
        .setExpressReq(req)
        .setUpstreamRequestParams({
          requestBody: req.body,
        })
        .log();

      return errorUtils.sendMalformedRequestError(
        res,
        "A download status report must contain a valid deploymentKey and package label."
      );
    }
    return redisManager
      .incrementLabelStatusCount(deploymentKey, req.body.label, redis.DOWNLOADED)
      .then(() => {
        Logger.info("[Starlink::OTA::reportStatusDownload::success")
          .setExpressReq(req)
          .setData({
            deploymentKey,
            label: req.body.label,
          })
          .log();
        res.sendStatus(200);
      })
      .catch((error: any) => {
        Logger.error("[Starlink::OTA::reportStatusDownload::error")
          .setExpressReq(req)
          .setError(error)
          .setData({
            deploymentKey,
            label: req.body.label,
          })
          .log();

        errorUtils.sendUnknownError(res, error, next);
      })
      .done();
  };

  /**
   * This middleware is used to sanitize the input for the acquisition endpoints.
   * It is used to prevent the endpoints from being abused by oversized inputs.
   * if any input is found to be oversized[>128 chars,configurable with env variable], it will return a 400 error.
   */
  router.use(acquisitionInputSanitizer());

  router.get("/updateCheck", updateCheck(false));
  // Games24x7 Apps: Using this endpoint to check for updates
  router.get("/v0.1/public/codepush/update_check", updateCheck(true));

  router.post("/reportStatus/deploy", reportStatusDeploy);
  router.post("/v0.1/public/codepush/report_status/deploy", reportStatusDeploy);

  router.post("/reportStatus/download", reportStatusDownload);
  router.post("/v0.1/public/codepush/report_status/download", reportStatusDownload);

  return router;
}
