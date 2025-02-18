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
        console.log(`Worker ${process.pid} - API host listening at https://localhost:${port}`);
      });
    } else {
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
      Logger.instance("clusterMetrics failed").setError(ex).log();
      res.status(500).json({
        error: "Failed to collect metrics",
        message: ex.message,
      });
    }
  });

  // Add port to env var and logging
  const metricsPort = process.env.METRICS_PORT || 3001;
  metricsServer.listen(metricsPort, () => {
    console.log(`Metrics server listening on port ${metricsPort}`);
  });
}
