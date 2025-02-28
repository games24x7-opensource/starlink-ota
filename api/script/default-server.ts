// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import bodyParser from "body-parser";
import express, { Response } from "express";
import q from "q";
import promClient from "prom-client";

import * as api from "./api";
import { AwsStorage } from "./storage/aws-storage";
import { fileUploadMiddleware } from "./file-upload-manager";
import { JsonStorage } from "./storage/json-storage";
import { RedisManager } from "./redis-manager";
import { Storage } from "./storage/storage";
import { globalErrorHandler } from "./middleware/error-handler";
const Logger = require("./logger");

interface Secret {
  id: string;
  value: string;
}

function bodyParserErrorHandler(err: any, req: express.Request, res: express.Response, next: Function): void {
  if (err) {
    if (err.message === "invalid json" || (err.name === "SyntaxError" && ~err.stack.indexOf("body-parser"))) {
      req.body = null;
      next();
    } else {
      next(err);
    }
  } else {
    next();
  }
}

export function start(done: (err?: any, server?: express.Express, storage?: Storage) => void, useJsonStorage?: boolean): void {
  let storage: Storage;
  let isKeyVaultConfigured: boolean;
  let keyvaultClient: any;

  q<void>(null)
    .then(async () => {
      if (useJsonStorage) {
        storage = new JsonStorage();
        return;
      }

      storage = new AwsStorage();
    })
    .then(() => {
      const app = express();
      const auth = api.auth({ storage: storage });
      const redisManager = new RedisManager();

      app.use(function requestStart(req, res, next) {
        Logger.info("access-log in").setExpressReq(req, true).log();
        next();
      });

      // Monkey-patch res.send and res.setHeader to no-op after the first call and prevent "already sent" errors.
      app.use((req: express.Request, res: express.Response, next: (err?: any) => void): any => {
        const originalSend = res.send;
        const originalSetHeader = res.setHeader;
        res.setHeader = (name: string, value: string | number | readonly string[]): Response => {
          if (!res.headersSent) {
            originalSetHeader.apply(res, [name, value]);
          }

          return {} as Response;
        };

        res.send = (body: any) => {
          if (res.headersSent) {
            return res;
          }

          return originalSend.apply(res, [body]);
        };

        next();
      });

      // Enforce a timeout on all requests.
      app.use(api.requestTimeoutHandler());

      // Before other middleware which may use request data that this middleware modifies.
      app.use(api.inputSanitizer());

      // body-parser must be before the Application Insights router.
      app.use(bodyParser.urlencoded({ extended: true }));
      const jsonOptions: any = { limit: "10kb", strict: true };

      app.use(bodyParser.json(jsonOptions));

      // If body-parser throws an error, catch it and set the request body to null.
      app.use(bodyParserErrorHandler);

      app.get("/", (req: express.Request, res: express.Response, next: (err?: Error) => void): any => {
        res.send("Welcome to the Starlink OTA REST API!");
      });

      app.get("/alb/healthCheck", (req: express.Request, res: express.Response, next: (err?: Error) => void): any => {
        res.status(200).send({ status: true });
      });

      /**
       * Prometheus metrics
       */
      const defaultLabels = { application: "starlink-ota" };
      promClient.register.setDefaultLabels(defaultLabels);
      //record default internal metrics
      promClient.collectDefaultMetrics();
      app.get("/metrics", async (req: express.Request, res: express.Response, next: (err?: Error) => void): Promise<any> => {
        try {
          res.setHeader("Content-Type", promClient.register.contentType);
          res.send(await promClient.register.metrics());
        } catch (ex) {
          res.status(500).send((ex as Error).toString());
        }
      });

      app.set("etag", false);
      app.set("views", __dirname + "/views");
      app.set("view engine", "ejs");
      app.use("/auth/images/", express.static(__dirname + "/views/images"));
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
        Logger.info("CAUTION: Acquisition routes are enabled").log();
        app.use(api.acquisition({ storage: storage, redisManager: redisManager }));
      } else {
        if (process.env.DISABLE_MANAGEMENT !== "true") {
          if (process.env.DEBUG_DISABLE_AUTH === "true") {
            app.use((req: express.Request, res: express.Response, next: Function): any => {
              const userId = process.env.DEBUG_USER_ID || "default";
              req.user = { id: userId };
              next();
            });
          } else {
            app.use(auth.router());
          }
          Logger.info("CAUTION: Management routes are enabled").log();
          app.use(fileUploadMiddleware, api.management({ storage: storage, redisManager: redisManager }));
        } else {
          app.use(auth.legacyRouter());
        }
      }

      // Global error handling - must be added last to catch all errors
      app.use(globalErrorHandler);
      done(null, app, storage);
    })
    .done();
}
