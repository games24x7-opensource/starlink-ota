"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = start;
const api = require("./api");
const aws_storage_1 = require("./storage/aws-storage");
const file_upload_manager_1 = require("./file-upload-manager");
const json_storage_1 = require("./storage/json-storage");
const redis_manager_1 = require("./redis-manager");
const bodyParser = require("body-parser");
const domain = require("express-domain-middleware");
const express = require("express");
const q = require("q");
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
    q(null)
        .then(async () => {
        if (useJsonStorage) {
            storage = new json_storage_1.JsonStorage();
            return;
        }
        storage = new aws_storage_1.AwsStorage();
    })
        .then(() => {
        const app = express();
        const auth = api.auth({ storage: storage });
        const appInsights = api.appInsights();
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
        app.use(bodyParser.urlencoded({ extended: true }));
        const jsonOptions = { limit: "10kb", strict: true };
        if (process.env.LOG_INVALID_JSON_REQUESTS === "true") {
            jsonOptions.verify = (req, res, buf, encoding) => {
                if (buf && buf.length) {
                    req.rawBody = buf.toString();
                }
            };
        }
        app.use(bodyParser.json(jsonOptions));
        // If body-parser throws an error, catch it and set the request body to null.
        app.use(bodyParserErrorHandler);
        // Before all other middleware to ensure all requests are tracked.
        app.use(appInsights.router());
        app.get("/", (req, res, next) => {
            res.send("Welcome to the CodePush REST API!");
        });
        app.get("/alb/healthCheck", (req, res, next) => {
            res.status(200).send({ status: true });
        });
        app.set("etag", false);
        app.set("views", __dirname + "/views");
        app.set("view engine", "ejs");
        app.use("/auth/images/", express.static(__dirname + "/views/images"));
        app.use(api.headers({ origin: process.env.CORS_ORIGIN || "http://localhost:3002" }));
        app.use(api.health({ storage: storage, redisManager: redisManager }));
        if (process.env.DISABLE_ACQUISITION !== "true") {
            app.use(api.acquisition({ storage: storage, redisManager: redisManager }));
        }
        if (process.env.DISABLE_MANAGEMENT !== "true") {
            if (process.env.DEBUG_DISABLE_AUTH === "true") {
                app.use((req, res, next) => {
                    let userId = "default";
                    if (process.env.DEBUG_USER_ID) {
                        userId = process.env.DEBUG_USER_ID;
                    }
                    else {
                        console.log("No DEBUG_USER_ID environment variable configured. Using 'default' as user id");
                    }
                    req.user = {
                        id: "g24x7",
                    };
                    next();
                });
            }
            else {
                app.use(auth.router());
            }
            app.use(file_upload_manager_1.fileUploadMiddleware, api.management({ storage: storage, redisManager: redisManager }));
        }
        else {
            app.use(auth.legacyRouter());
        }
        // Error handler needs to be the last middleware so that it can catch all unhandled exceptions
        app.use(appInsights.errorHandler);
        done(null, app, storage);
    })
        .done();
}
//# sourceMappingURL=default-server.js.map