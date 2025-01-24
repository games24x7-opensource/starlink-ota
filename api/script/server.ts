// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as express from "express";
import * as defaultServer from "./default-server";
import { AggregatorRegistry, Registry, Counter } from "prom-client";
const cluster = require("cluster");
import * as os from "os";

const https = require("https");
const fs = require("fs");

const aggregatorRegistry = new AggregatorRegistry();
const masterRegistry = new Registry();

const productType = process.env.PRODUCT_TYPE || "all";
const defaultLabels = { application: "code-push-client", productType };
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
