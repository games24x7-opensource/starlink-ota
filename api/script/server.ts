// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import express from "express";
const https = require("https");
const cluster = require("cluster");
const fs = require("fs");
import { AggregatorRegistry, Registry, Counter } from "prom-client";
const Logger = require("./logger");
import * as defaultServer from "./default-server";
const aggregatorRegistry = new AggregatorRegistry();
const masterRegistry = new Registry();

const productType = process.env.PRODUCT_TYPE || "all";
const defaultLabels = { application: "starlink-ota", productType };
masterRegistry.setDefaultLabels(defaultLabels);

const processCrashCounter = new Counter({
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
  if (process.env.NODE_ENV === "development") numCPUs = 1;

  Logger.info(`Primary process ${process.pid} is running`).log();
  Logger.info(`Starting ${numCPUs} workers...`).log();

  // Fork workers for each available CPU core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  // Handle worker exits and restart them
  cluster.on("exit", (worker, code, signal) => {
    Logger.info(`Worker ${worker.process.pid} died. Restarting...`).log();
    processCrashCounter.inc();
    cluster.fork();
  });

  startMasterMetricsServer();
} else {
  // Worker processes will run the server
  defaultServer.start(function (err: Error, app: express.Express) {
    if (err) {
      throw err;
    }

    const httpsEnabled: boolean = process.env.HTTPS === "true" || false;
    const defaultPort: number = httpsEnabled ? 8443 : Number(process.env.API_PORT);

    const port: number = Number(process.env.API_PORT) || Number(process.env.PORT) || defaultPort;
    let server: any;

    if (httpsEnabled) {
      const options = {
        key: fs.readFileSync("./certs/cert.key", "utf8"),
        cert: fs.readFileSync("./certs/cert.crt", "utf8"),
      };

      server = https.createServer(options, app).listen(port, function () {
        Logger.info(`Worker ${process.pid} - API host listening at ${port}`).log();
      });
    } else {
      server = app.listen(port, function () {
        Logger.info(`Worker ${process.pid} - API host listening at ${port}`).log();
      });
    }

    server.setTimeout(0);

    // Handle SIGTERM for graceful shutdown
    process.on("SIGTERM", () => {
      Logger.info("signal=SIGTERM; shutting down").log();
      shutdown(server);
    });

    // Handle SIGINT for graceful shutdown
    process.on("SIGINT", () => {
      Logger.info("signal=SIGINT; shutting down").log();
      shutdown(server);
    });

    
  });

  // Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.log("Uncaught Exception:", err);
  Logger.error("Uncaught Exception:").setError(err).log();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.log("Unhandled Rejection at:", reason);
  Logger.error("Unhandled Rejection at:").setError(reason).log();

  process.exit(1);
});

}

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  Logger.error("Uncaught Exception:").setError(err).log();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  Logger.error("Unhandled Rejection at:").setError(reason).log();
  process.exit(1);
});

// Function to gracefully shut down the server
const shutdown = (server) => {
  server.close((err) => {
    if (err) {
      Logger.error("Error during server shutdown:").setError(err).log();
      process.exit(1);
    }
    Logger.info("HTTP server closed gracefully").log();
    process.exit(0);
  });

  // Optional: Set a timeout to force shutdown if not completed in a certain time
  setTimeout(() => {
    Logger.info("Forcing shutdown after timeout").log();
    process.exit(1);
  }, 10000); // 10 seconds timeout
};

// server for cluster metrics
function startMasterMetricsServer() {
  const express = require("express");
  const metricsServer = express();

  // Add basic health check endpoint
  metricsServer.get("/health", (req, res) => {
    res.status(200).send({ status: "ok" });
  });

  // Add error handling for metrics endpoint
  metricsServer.get("/clusterMetrics", async (req, res) => {
    try {
      const [workerMetrics, masterMetrics] = await Promise.all([aggregatorRegistry.clusterMetrics(), masterRegistry.metrics()]);

      const allMetrics = workerMetrics + masterMetrics;
      res.set("Content-Type", aggregatorRegistry.contentType);
      res.send(allMetrics);
    } catch (ex) {
      Logger.info("clusterMetrics failed").setError(ex).log();
      res.status(500).json({
        error: "Failed to collect metrics",
        message: ex.message,
      });
    }
  });

  // Add port to env var and logging
  const metricsPort = process.env.METRICS_PORT || 3001;
  metricsServer.listen(metricsPort, () => {
    Logger.info(`Metrics server listening on port ${metricsPort}`).log();
  });
}
