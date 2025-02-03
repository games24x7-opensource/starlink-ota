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
const defaultServer = __importStar(require("./default-server"));
const prom_client_1 = require("prom-client");
const cluster = require("cluster");
const https = require("https");
const fs = require("fs");
const aggregatorRegistry = new prom_client_1.AggregatorRegistry();
const masterRegistry = new prom_client_1.Registry();
const productType = process.env.PRODUCT_TYPE || "all";
const defaultLabels = { application: "code-push-client", productType };
masterRegistry.setDefaultLabels(defaultLabels);
const processCrashCounter = new prom_client_1.Counter({
    name: "process_crash",
    help: "None",
    registers: [masterRegistry],
});
if (cluster?.isPrimary) {
    // Get the number of available CPU cores
    let numCPUs = require("os").availableParallelism();
    /**
     * For K8 environment we take the numCPUs value from the environment variable NODEJS_WORKERS
     */
    if (process.env?.NODEJS_WORKERS) {
        numCPUs = process.env.NODEJS_WORKERS;
        numCPUs = parseInt(numCPUs);
    }
    // For dev machines
    if (process.env.NODE_ENV === "development")
        numCPUs = 1;
    console.log(`Primary process ${process.pid} is running`);
    console.log(`Starting ${numCPUs} workers...`);
    // Fork workers for each available CPU core
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    // Handle worker exits and restart them
    cluster.on("exit", (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died. Restarting...`);
        processCrashCounter.inc();
        cluster.fork();
    });
}
else {
    // Worker processes will run the server
    defaultServer.start(function (err, app) {
        if (err) {
            throw err;
        }
        const httpsEnabled = process.env.HTTPS === "true" || false;
        const defaultPort = httpsEnabled ? 8443 : Number(process.env.API_PORT);
        const port = Number(process.env.API_PORT) || Number(process.env.PORT) || defaultPort;
        let server;
        if (httpsEnabled) {
            const options = {
                key: fs.readFileSync("./certs/cert.key", "utf8"),
                cert: fs.readFileSync("./certs/cert.crt", "utf8"),
            };
            server = https.createServer(options, app).listen(port, function () {
                console.log(`Worker ${process.pid} - API host listening at https://localhost:${port}`);
            });
        }
        else {
            server = app.listen(port, function () {
                console.log(`Worker ${process.pid} - API host listening at http://localhost:${port}`);
            });
        }
        server.setTimeout(0);
        // Handle SIGTERM for graceful shutdown
        process.on("SIGTERM", () => {
            console.log("signal=SIGTERM; shutting down");
            shutdown(server);
        });
        // Handle SIGINT for graceful shutdown
        process.on("SIGINT", () => {
            console.log("signal=SIGINT; shutting down");
            shutdown(server);
        });
    });
}
// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    process.exit(1);
});
// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
});
// Function to gracefully shut down the server
const shutdown = (server) => {
    server.close((err) => {
        if (err) {
            console.error("Error during server shutdown:", err);
            process.exit(1);
        }
        console.log("HTTP server closed gracefully");
        process.exit(0);
    });
    // Optional: Set a timeout to force shutdown if not completed in a certain time
    setTimeout(() => {
        console.warn("Forcing shutdown after timeout");
        process.exit(1);
    }, 10000); // 10 seconds timeout
};
//# sourceMappingURL=server.js.map