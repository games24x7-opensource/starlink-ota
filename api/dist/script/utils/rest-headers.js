"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SDK_VERSION_HEADER = exports.PLUGIN_VERSION_HEADER = exports.PLUGIN_NAME_HEADER = exports.CLI_VERSION_HEADER = exports.API_VERSION_HEADER = exports.API_VERSION = void 0;
exports.getSdkVersion = getSdkVersion;
exports.getCliVersion = getCliVersion;
exports.getPluginName = getPluginName;
exports.getPluginVersion = getPluginVersion;
exports.getIpAddress = getIpAddress;
exports.API_VERSION = 2;
exports.API_VERSION_HEADER = "X-CodePush-API-Version";
exports.CLI_VERSION_HEADER = "X-CodePush-CLI-Version";
exports.PLUGIN_NAME_HEADER = "X-CodePush-Plugin-Name";
exports.PLUGIN_VERSION_HEADER = "X-CodePush-Plugin-Version";
exports.SDK_VERSION_HEADER = "X-CodePush-SDK-Version";
function getSdkVersion(req) {
    return req.get(exports.SDK_VERSION_HEADER);
}
function getCliVersion(req) {
    return req.get(exports.CLI_VERSION_HEADER);
}
function getPluginName(req) {
    return req.get(exports.PLUGIN_NAME_HEADER);
}
function getPluginVersion(req) {
    return req.get(exports.PLUGIN_VERSION_HEADER);
}
function getIpAddress(req) {
    const ipAddress = req.headers["x-client-ip"] ||
        req.headers["x-forwarded-for"] ||
        req.headers["x-real-ip"] ||
        req.headers["x-cluster-client-ip"] ||
        req.headers["x-forwarded"] ||
        req.headers["forwarded-for"] ||
        req.headers["forwarded"] ||
        (req.socket && req.socket.remoteAddress) ||
        (req.info && req.info.remoteAddress);
    return ipAddress
        ? // Some of the headers are set by proxies to a comma-separated list of IPs starting from the origin.
            ipAddress.split(",")[0]
        : "Unknown";
}
