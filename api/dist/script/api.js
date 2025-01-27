"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.headers = headers;
exports.acquisition = acquisition;
exports.health = health;
exports.management = management;
exports.auth = auth;
exports.appInsights = appInsights;
exports.inputSanitizer = inputSanitizer;
exports.requestTimeoutHandler = requestTimeoutHandler;
const headers_1 = require("./routes/headers");
const acquisition_1 = require("./routes/acquisition");
const management_1 = require("./routes/management");
const passport_authentication_1 = require("./routes/passport-authentication");
const app_insights_1 = require("./routes/app-insights");
const input_sanitizer_1 = require("./routes/input-sanitizer");
const request_timeout_1 = require("./routes/request-timeout");
function headers(config) {
    return (0, headers_1.getHeadersMiddleware)(config);
}
function acquisition(config) {
    return (0, acquisition_1.getAcquisitionRouter)(config);
}
function health(config) {
    return (0, acquisition_1.getHealthRouter)(config);
}
function management(config) {
    return (0, management_1.getManagementRouter)(config);
}
function auth(config) {
    const passportAuthentication = new passport_authentication_1.PassportAuthentication(config);
    return {
        router: passportAuthentication.getRouter.bind(passportAuthentication),
        legacyRouter: passportAuthentication.getLegacyRouter.bind(passportAuthentication),
        authenticate: passportAuthentication.authenticate,
    };
}
function appInsights() {
    const appInsights = new app_insights_1.AppInsights();
    return {
        router: appInsights.getRouter.bind(appInsights),
        errorHandler: appInsights.errorHandler.bind(appInsights),
    };
}
function inputSanitizer() {
    return input_sanitizer_1.InputSanitizer;
}
function requestTimeoutHandler() {
    return request_timeout_1.RequestTimeoutHandler;
}
