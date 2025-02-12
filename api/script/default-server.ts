// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as api from "./api";
import { AwsStorage } from "./storage/aws-storage";
import { fileUploadMiddleware } from "./file-upload-manager";
import { JsonStorage } from "./storage/json-storage";
import { RedisManager } from "./redis-manager";
import { Storage } from "./storage/storage";
import { Response } from "express";
import * as promClient from "prom-client";

import * as bodyParser from "body-parser";
const domain = require("express-domain-middleware");
import * as express from "express";
import * as q from "q";

import { awsErrorMiddleware } from "./utils/awsErrorHandler";

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
      const appInsights = api.appInsights();
      const redisManager = new RedisManager();

      // First, to wrap all requests and catch all exceptions.
      app.use(domain);

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

      if (process.env.LOGGING) {
        app.use((req: express.Request, res: express.Response, next: (err?: any) => void): any => {
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
      const jsonOptions: any = { limit: "10kb", strict: true };
      if (process.env.LOG_INVALID_JSON_REQUESTS === "true") {
        jsonOptions.verify = (req: express.Request, res: express.Response, buf: Buffer, encoding: string) => {
          if (buf && buf.length) {
            (<any>req).rawBody = buf.toString();
          }
        };
      }

      app.use(bodyParser.json(jsonOptions));

      // If body-parser throws an error, catch it and set the request body to null.
      app.use(bodyParserErrorHandler);

      // Before all other middleware to ensure all requests are tracked.
      app.use(appInsights.router());

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
      app.use(api.headers({ origin: process.env.CORS_ORIGIN}));

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
          console.log("Management routes are enabled ✅");
          app.use(fileUploadMiddleware, api.management({ storage: storage, redisManager: redisManager }));
        } else {
          app.use(auth.legacyRouter());
        }
      }

      // Error handler needs to be the last middleware so that it can catch all unhandled exceptions
      app.use(appInsights.errorHandler);
      // Error handling middleware for AWS errors
      app.use(awsErrorMiddleware);

      done(null, app, storage);
    })
    .done();
}
