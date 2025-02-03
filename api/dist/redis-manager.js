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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisManager = exports.Utilities = exports.DOWNLOADED = exports.ACTIVE = exports.DEPLOYMENT_FAILED = exports.DEPLOYMENT_SUCCEEDED = void 0;
const assert = __importStar(require("assert"));
const q = __importStar(require("q"));
const redis = __importStar(require("redis"));
exports.DEPLOYMENT_SUCCEEDED = "DeploymentSucceeded";
exports.DEPLOYMENT_FAILED = "DeploymentFailed";
exports.ACTIVE = "Active";
exports.DOWNLOADED = "Downloaded";
var Utilities;
(function (Utilities) {
    function isValidDeploymentStatus(status) {
        return status === exports.DEPLOYMENT_SUCCEEDED || status === exports.DEPLOYMENT_FAILED || status === exports.DOWNLOADED;
    }
    Utilities.isValidDeploymentStatus = isValidDeploymentStatus;
    function getLabelStatusField(label, status) {
        if (isValidDeploymentStatus(status)) {
            return label + ":" + status;
        }
        else {
            return null;
        }
    }
    Utilities.getLabelStatusField = getLabelStatusField;
    function getLabelActiveCountField(label) {
        if (label) {
            return label + ":" + exports.ACTIVE;
        }
        else {
            return null;
        }
    }
    Utilities.getLabelActiveCountField = getLabelActiveCountField;
    function getDeploymentKeyHash(deploymentKey) {
        return "deploymentKey:" + deploymentKey;
    }
    Utilities.getDeploymentKeyHash = getDeploymentKeyHash;
    function getDeploymentKeyLabelsHash(deploymentKey) {
        return "deploymentKeyLabels:" + deploymentKey;
    }
    Utilities.getDeploymentKeyLabelsHash = getDeploymentKeyLabelsHash;
    function getDeploymentKeyClientsHash(deploymentKey) {
        return "deploymentKeyClients:" + deploymentKey;
    }
    Utilities.getDeploymentKeyClientsHash = getDeploymentKeyClientsHash;
})(Utilities || (exports.Utilities = Utilities = {}));
class PromisifiedRedisClient {
    // An incomplete set of promisified versions of the original redis methods
    del = null;
    execBatch = null;
    exists = null;
    expire = null;
    hdel = null;
    hget = null;
    hgetall = null;
    hincrby = null;
    hset = null;
    ping = null;
    quit = null;
    select = null;
    set = null;
    constructor(redisClient) {
        this.execBatch = (redisBatchClient) => {
            return q.ninvoke(redisBatchClient, "exec");
        };
        for (const functionName in this) {
            if (this.hasOwnProperty(functionName) && this[functionName] === null) {
                const originalFunction = redisClient[functionName];
                assert(!!originalFunction, "Binding a function that does not exist: " + functionName);
                this[functionName] = q.nbind(originalFunction, redisClient);
            }
        }
    }
}
class RedisManager {
    static DEFAULT_EXPIRY = 3600; // one hour, specified in seconds
    static METRICS_DB = 1;
    _opsClient;
    _promisifiedOpsClient;
    _metricsClient;
    _promisifiedMetricsClient;
    _setupMetricsClientPromise;
    _isConnected = false;
    constructor() {
        if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
            const redisConfig = {
                host: process.env.REDIS_HOST,
                port: Number(process.env.REDIS_PORT),
                ...(process.env.REDIS_TLS === "true" && {
                    tls: {
                        rejectUnauthorized: true,
                    },
                }),
                enableOfflineQueue: true,
                enableReadyCheck: true,
                cluster: false,
            };
            console.log("Initializing Redis with config:", {
                ...redisConfig,
                host: redisConfig.host,
                port: redisConfig.port,
                tls: !!redisConfig.tls,
            });
            this._opsClient = redis.createClient(redisConfig);
            this._metricsClient = redis.createClient(redisConfig);
            // Add end event handlers
            this._opsClient.on("connect", () => {
                console.log(`Redis ops client connected successfully to ${redisConfig.host}:${redisConfig.port}`);
                this._isConnected = true;
            });
            this._metricsClient.on("connect", () => {
                console.log(`Redis metrics client connected successfully to ${redisConfig.host}:${redisConfig.port}`);
            });
            this._opsClient.on("error", (err) => {
                console.error("Redis ops client error:", err);
                this._isConnected = false;
            });
            this._metricsClient.on("error", (err) => {
                console.error("Redis metrics client error:", err);
            });
            this._opsClient.on("ready", () => {
                console.log("Redis ops client ready for commands");
            });
            this._metricsClient.on("ready", () => {
                console.log("Redis metrics client ready for commands");
            });
            this._opsClient.on("end", () => {
                console.log("Redis ops client connection closed");
            });
            this._metricsClient.on("end", () => {
                console.log("Redis metrics client connection closed");
            });
            // Handle process termination
            // process.on("SIGTERM", () => this.gracefulShutdown());
            // process.on("SIGINT", () => this.gracefulShutdown());
            this._promisifiedOpsClient = new PromisifiedRedisClient(this._opsClient);
            this._promisifiedMetricsClient = new PromisifiedRedisClient(this._metricsClient);
            this._setupMetricsClientPromise = this._promisifiedMetricsClient
                .select(RedisManager.METRICS_DB)
                .then(() => this._promisifiedMetricsClient.set("health", "health"));
        }
        else {
            console.warn("No REDIS_HOST or REDIS_PORT environment variable configured.");
        }
    }
    // private async gracefulShutdown(): Promise<any> {
    //   console.log("Initiating graceful shutdown of Redis connections...");
    //   try {
    //     await this.close();
    //     console.log("Redis connections closed successfully");
    //   } catch (error) {
    //     console.error("Error during Redis shutdown:", error);
    //   }
    // }
    get isEnabled() {
        return !!this._opsClient && !!this._metricsClient;
    }
    checkHealth() {
        if (!this.isEnabled) {
            return q.reject("Redis manager is not enabled");
        }
        return q.all([this._promisifiedOpsClient.ping(), this._promisifiedMetricsClient.ping()]).spread(() => { });
    }
    /**
     * Get a response from cache if possible, otherwise return null.
     * @param expiryKey: An identifier to get cached response if not expired
     * @param url: The url of the request to cache
     * @return The object of type CacheableResponse
     */
    getCachedResponse(expiryKey, url) {
        if (!this.isEnabled) {
            return q(null);
        }
        return this._promisifiedOpsClient.hget(expiryKey, url).then((serializedResponse) => {
            if (serializedResponse) {
                const response = JSON.parse(serializedResponse);
                return q(response);
            }
            else {
                return q(null);
            }
        });
    }
    /**
     * Set a response in redis cache for given expiryKey and url.
     * @param expiryKey: An identifier that you can later use to expire the cached response
     * @param url: The url of the request to cache
     * @param response: The response to cache
     */
    setCachedResponse(expiryKey, url, response) {
        if (!this.isEnabled) {
            return q(null);
        }
        // Store response in cache with a timed expiry
        const serializedResponse = JSON.stringify(response);
        let isNewKey;
        return this._promisifiedOpsClient
            .exists(expiryKey)
            .then((isExisting) => {
            isNewKey = !isExisting;
            return this._promisifiedOpsClient.hset(expiryKey, url, serializedResponse);
        })
            .then(() => {
            if (isNewKey) {
                return this._promisifiedOpsClient.expire(expiryKey, RedisManager.DEFAULT_EXPIRY);
            }
        })
            .then(() => { });
    }
    // Atomically increments the status field for the deployment by 1,
    // or 1 by default. If the field does not exist, it will be created with the value of 1.
    incrementLabelStatusCount(deploymentKey, label, status) {
        if (!this.isEnabled) {
            return q(null);
        }
        const hash = Utilities.getDeploymentKeyLabelsHash(deploymentKey);
        const field = Utilities.getLabelStatusField(label, status);
        return this._setupMetricsClientPromise.then(() => this._promisifiedMetricsClient.hincrby(hash, field, 1)).then(() => { });
    }
    clearMetricsForDeploymentKey(deploymentKey) {
        if (!this.isEnabled) {
            return q(null);
        }
        return this._setupMetricsClientPromise
            .then(() => this._promisifiedMetricsClient.del(Utilities.getDeploymentKeyLabelsHash(deploymentKey), Utilities.getDeploymentKeyClientsHash(deploymentKey)))
            .then(() => { });
    }
    // Promised return value will look something like
    // { "v1:DeploymentSucceeded": 123, "v1:DeploymentFailed": 4, "v1:Active": 123 ... }
    getMetricsWithDeploymentKey(deploymentKey) {
        if (!this.isEnabled) {
            return q(null);
        }
        return this._setupMetricsClientPromise
            .then(() => this._promisifiedMetricsClient.hgetall(Utilities.getDeploymentKeyLabelsHash(deploymentKey)))
            .then((metrics) => {
            // Redis returns numerical values as strings, handle parsing here.
            if (metrics) {
                Object.keys(metrics).forEach((metricField) => {
                    if (!isNaN(metrics[metricField])) {
                        metrics[metricField] = +metrics[metricField];
                    }
                });
            }
            return metrics;
        });
    }
    recordUpdate(currentDeploymentKey, currentLabel, previousDeploymentKey, previousLabel) {
        if (!this.isEnabled) {
            return q(null);
        }
        return this._setupMetricsClientPromise
            .then(() => {
            const batchClient = this._metricsClient.batch();
            const currentDeploymentKeyLabelsHash = Utilities.getDeploymentKeyLabelsHash(currentDeploymentKey);
            const currentLabelActiveField = Utilities.getLabelActiveCountField(currentLabel);
            const currentLabelDeploymentSucceededField = Utilities.getLabelStatusField(currentLabel, exports.DEPLOYMENT_SUCCEEDED);
            batchClient.hincrby(currentDeploymentKeyLabelsHash, currentLabelActiveField, /* incrementBy */ 1);
            batchClient.hincrby(currentDeploymentKeyLabelsHash, currentLabelDeploymentSucceededField, /* incrementBy */ 1);
            if (previousDeploymentKey && previousLabel) {
                const previousDeploymentKeyLabelsHash = Utilities.getDeploymentKeyLabelsHash(previousDeploymentKey);
                const previousLabelActiveField = Utilities.getLabelActiveCountField(previousLabel);
                batchClient.hincrby(previousDeploymentKeyLabelsHash, previousLabelActiveField, /* incrementBy */ -1);
            }
            return this._promisifiedMetricsClient.execBatch(batchClient);
        })
            .then(() => { });
    }
    removeDeploymentKeyClientActiveLabel(deploymentKey, clientUniqueId) {
        if (!this.isEnabled) {
            return q(null);
        }
        return this._setupMetricsClientPromise
            .then(() => {
            const deploymentKeyClientsHash = Utilities.getDeploymentKeyClientsHash(deploymentKey);
            return this._promisifiedMetricsClient.hdel(deploymentKeyClientsHash, clientUniqueId);
        })
            .then(() => { });
    }
    invalidateCache(expiryKey) {
        if (!this.isEnabled)
            return q(null);
        return this._promisifiedOpsClient.del(expiryKey).then(() => { });
    }
    // For unit tests only
    close() {
        const promiseChain = q(null);
        if (!this._opsClient && !this._metricsClient)
            return promiseChain;
        return promiseChain
            .then(() => this._opsClient && this._promisifiedOpsClient.quit())
            .then(() => this._metricsClient && this._promisifiedMetricsClient.quit())
            .then(() => null);
    }
    /* deprecated */
    getCurrentActiveLabel(deploymentKey, clientUniqueId) {
        if (!this.isEnabled) {
            return q(null);
        }
        return this._setupMetricsClientPromise.then(() => this._promisifiedMetricsClient.hget(Utilities.getDeploymentKeyClientsHash(deploymentKey), clientUniqueId));
    }
    /* deprecated */
    updateActiveAppForClient(deploymentKey, clientUniqueId, toLabel, fromLabel) {
        if (!this.isEnabled) {
            return q(null);
        }
        return this._setupMetricsClientPromise
            .then(() => {
            const batchClient = this._metricsClient.batch();
            const deploymentKeyLabelsHash = Utilities.getDeploymentKeyLabelsHash(deploymentKey);
            const deploymentKeyClientsHash = Utilities.getDeploymentKeyClientsHash(deploymentKey);
            const toLabelActiveField = Utilities.getLabelActiveCountField(toLabel);
            batchClient.hset(deploymentKeyClientsHash, clientUniqueId, toLabel);
            batchClient.hincrby(deploymentKeyLabelsHash, toLabelActiveField, /* incrementBy */ 1);
            if (fromLabel) {
                const fromLabelActiveField = Utilities.getLabelActiveCountField(fromLabel);
                batchClient.hincrby(deploymentKeyLabelsHash, fromLabelActiveField, /* incrementBy */ -1);
            }
            return this._promisifiedMetricsClient.execBatch(batchClient);
        })
            .then(() => { });
    }
}
exports.RedisManager = RedisManager;
//# sourceMappingURL=redis-manager.js.map