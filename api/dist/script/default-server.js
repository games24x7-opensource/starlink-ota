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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = start;
const body_parser_1 = __importDefault(require("body-parser"));
const domain = require("express-domain-middleware");
const express_1 = __importDefault(require("express"));
const q_1 = __importDefault(require("q"));
const prom_client_1 = __importDefault(require("prom-client"));
const api = __importStar(require("./api"));
const aws_storage_1 = require("./storage/aws-storage");
const file_upload_manager_1 = require("./file-upload-manager");
const json_storage_1 = require("./storage/json-storage");
const redis_manager_1 = require("./redis-manager");
const awsErrorHandler_1 = require("./utils/awsErrorHandler");
function bodyParserErrorHandler(err, req, res, next) {
    if (err) {
        if (err.message === "invalid json" || (err.name === "SyntaxError" && ~err.stack.indexOf("body-parser"))) {
            req.body = null;
            next();
        }
        else {
            next(err);
        }
    }
    else {
        next();
    }
}
function start(done, useJsonStorage) {
    let storage;
    let isKeyVaultConfigured;
    let keyvaultClient;
    (0, q_1.default)(null)
        .then(() => __awaiter(this, void 0, void 0, function* () {
        if (useJsonStorage) {
            storage = new json_storage_1.JsonStorage();
            return;
        }
        storage = new aws_storage_1.AwsStorage();
    }))
        .then(() => {
        const app = (0, express_1.default)();
        const auth = api.auth({ storage: storage });
        const redisManager = new redis_manager_1.RedisManager();
        // First, to wrap all requests and catch all exceptions.
        app.use(domain);
        // Monkey-patch res.send and res.setHeader to no-op after the first call and prevent "already sent" errors.
        app.use((req, res, next) => {
            const originalSend = res.send;
            const originalSetHeader = res.setHeader;
            res.setHeader = (name, value) => {
                if (!res.headersSent) {
                    originalSetHeader.apply(res, [name, value]);
                }
                return {};
            };
            res.send = (body) => {
                if (res.headersSent) {
                    return res;
                }
                return originalSend.apply(res, [body]);
            };
            next();
        });
        if (process.env.LOGGING) {
            app.use((req, res, next) => {
                console.log(); // Newline to mark new request
                console.log(`[REST] Received ${req.method} request at ${req.originalUrl}`);
                next();
            });
        }
        // Enforce a timeout on all requests.
        app.use(api.requestTimeoutHandler());
        // Before other middleware which may use request data that this middleware modifies.
        app.use(api.inputSanitizer());
        // body-parser must be before the Application Insights router.
        app.use(body_parser_1.default.urlencoded({ extended: true }));
        const jsonOptions = { limit: "10kb", strict: true };
        if (process.env.LOG_INVALID_JSON_REQUESTS === "true") {
            jsonOptions.verify = (req, res, buf, encoding) => {
                if (buf && buf.length) {
                    req.rawBody = buf.toString();
                }
            };
        }
        app.use(body_parser_1.default.json(jsonOptions));
        // If body-parser throws an error, catch it and set the request body to null.
        app.use(bodyParserErrorHandler);
        app.get("/", (req, res, next) => {
            res.send("Welcome to the Starlink OTA REST API!");
        });
        app.get("/alb/healthCheck", (req, res, next) => {
            res.status(200).send({ status: true });
        });
        /**
         * Prometheus metrics
         */
        const defaultLabels = { application: "starlink-ota" };
        prom_client_1.default.register.setDefaultLabels(defaultLabels);
        //record default internal metrics
        prom_client_1.default.collectDefaultMetrics();
        app.get("/metrics", (req, res, next) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.setHeader("Content-Type", prom_client_1.default.register.contentType);
                res.send(yield prom_client_1.default.register.metrics());
            }
            catch (ex) {
                res.status(500).send(ex.toString());
            }
        }));
        app.set("etag", false);
        app.set("views", __dirname + "/views");
        app.set("view engine", "ejs");
        app.use("/auth/images/", express_1.default.static(__dirname + "/views/images"));
        app.use(api.headers({ origin: process.env.CORS_ORIGIN }));
        /**
         * TODO: This will actually check S3 object/ dynamo table read etc..
         * Do we need to check redis health?
         */
        // app.use(api.health({ storage: storage, redisManager: redisManager }));
        /**
         * If acquisition is enabled we make sure management routes are disabled
         * Management routes are disabled by default and enabled only when acquisition routes are off and management is enabled
         */
        if (process.env.DISABLE_ACQUISITION !== "true") {
            console.log("Acquisition routes are enabled ✅");
            app.use(api.acquisition({ storage: storage, redisManager: redisManager }));
        }
        else {
            if (process.env.DISABLE_MANAGEMENT !== "true") {
                if (process.env.DEBUG_DISABLE_AUTH === "true") {
                    app.use((req, res, next) => {
                        const userId = process.env.DEBUG_USER_ID || "default";
                        req.user = { id: userId };
                        next();
                    });
                }
                else {
                    app.use(auth.router());
                }
                console.log("Management routes are enabled ✅");
                app.use(file_upload_manager_1.fileUploadMiddleware, api.management({ storage: storage, redisManager: redisManager }));
            }
            else {
                app.use(auth.legacyRouter());
            }
        }
        // Error handling middleware for AWS errors
        app.use(awsErrorHandler_1.awsErrorMiddleware);
        done(null, app, storage);
    })
        .done();
}
//# sourceMappingURL=default-server.js.map