// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as express from "express";
import * as defaultServer from "./default-server";

const https = require("https");
const fs = require("fs");

defaultServer.start(function (err: Error, app: express.Express) {
  if (err) {
    throw err;
  }

  const httpsEnabled: boolean = process.env.HTTPS === "true" || false;
  const defaultPort: number = httpsEnabled ? 8443 : Number(process.env.API_PORT);

  const port: number = Number(process.env.API_PORT) || Number(process.env.PORT) || defaultPort;
  let server: any;

  if (httpsEnabled) {
    console.log(httpsEnabled, "loki:: https enabled");
    const options = {
      key: fs.readFileSync("./certs/cert.key", "utf8"),
      cert: fs.readFileSync("./certs/cert.crt", "utf8"),
    };

    server = https.createServer(options, app).listen(port, function () {
      console.log("API host listening at https://localhost:" + port);
    });
  } else {
    console.log(process.env.HTTPS, "loki::port");
    server = app.listen(port, function () {
      console.log("API host listening at http://localhost:" + port);
    });
  }

  server.setTimeout(0);
});
