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
exports.generateKey = generateKey;
exports.makeAccount = makeAccount;
exports.makeStorageAccessKey = makeStorageAccessKey;
exports.makeAccessKeyRequest = makeAccessKeyRequest;
exports.makeStorageApp = makeStorageApp;
exports.makeRestApp = makeRestApp;
exports.makeStorageDeployment = makeStorageDeployment;
exports.makeRestDeployment = makeRestDeployment;
exports.makePackage = makePackage;
exports.makeStreamFromString = makeStreamFromString;
exports.makeStringFromStream = makeStringFromStream;
exports.getStreamAndSizeForFile = getStreamAndSizeForFile;
exports.retrieveStringContentsFromUrl = retrieveStringContentsFromUrl;
const fs = __importStar(require("fs"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const q_1 = require("q");
const shortid = __importStar(require("shortid"));
const stream = __importStar(require("stream"));
const ACCESS_KEY_EXPIRY = 1000 * 60 * 60 * 24 * 60; // 60 days.
function generateKey() {
    return shortid.generate() + shortid.generate(); // The REST API validates that keys must be at least 10 characters long
}
function makeAccount() {
    var account = {
        createdTime: new Date().getTime(),
        name: "test account",
        email: "test_" + shortid.generate() + "@email.com",
    };
    return account;
}
function makeStorageAccessKey() {
    var now = new Date().getTime();
    var friendlyName = shortid.generate();
    var accessKey = {
        name: generateKey(),
        createdTime: now,
        createdBy: "test machine",
        friendlyName: friendlyName,
        description: friendlyName,
        expires: now + ACCESS_KEY_EXPIRY,
    };
    return accessKey;
}
function makeAccessKeyRequest() {
    var accessKeyRequest = {
        name: generateKey(),
        createdBy: "test machine",
        friendlyName: shortid.generate(),
        ttl: ACCESS_KEY_EXPIRY,
    };
    return accessKeyRequest;
}
function makeStorageApp() {
    var app = {
        createdTime: new Date().getDate(),
        name: shortid.generate(),
    };
    return app;
}
function makeRestApp() {
    var app = {
        name: shortid.generate(),
        deployments: ["Production", "Staging"],
    };
    return app;
}
function makeStorageDeployment() {
    var deployment = {
        createdTime: new Date().getDate(),
        name: shortid.generate(),
        key: generateKey(),
    };
    return deployment;
}
function makeRestDeployment() {
    var deployment = {
        name: shortid.generate(),
    };
    return deployment;
}
function makePackage(version, isMandatory, packageHash, label) {
    var storagePackage = {
        blobUrl: "testUrl.com",
        description: "test blob id",
        isDisabled: false,
        isMandatory: isMandatory || false,
        rollout: null,
        appVersion: version || "test blob id",
        label: label || null,
        packageHash: packageHash || "hash123_n",
        size: 1,
        manifestBlobUrl: "test manifest blob URL",
        uploadTime: new Date().getTime(),
    };
    return storagePackage;
}
function makeStreamFromString(stringValue) {
    var blobStream = new stream.Readable();
    blobStream.push(stringValue);
    blobStream.push(null);
    return blobStream;
}
function makeStringFromStream(stream) {
    var stringValue = "";
    return (0, q_1.Promise)((resolve) => {
        stream
            .on("data", (data) => {
            stringValue += data;
        })
            .on("end", () => {
            resolve(stringValue);
        });
    });
}
function getStreamAndSizeForFile(path) {
    return (0, q_1.Promise)((resolve, reject) => {
        fs.stat(path, (err, stats) => {
            if (err) {
                reject(err);
                return;
            }
            var readable = fs.createReadStream(path);
            resolve({ stream: readable, size: stats.size });
        });
    });
}
function retrieveStringContentsFromUrl(url) {
    var protocol = null;
    if (url.indexOf("https://") === 0) {
        protocol = https;
    }
    else {
        protocol = http;
    }
    return (0, q_1.Promise)((resolve) => {
        const requestOptions = {
            path: url,
        };
        protocol
            .get(requestOptions, (response) => {
            if (response.statusCode !== 200) {
                return null;
            }
            makeStringFromStream(response).then((contents) => {
                resolve(contents);
            });
        })
            .on("error", (error) => {
            resolve(null);
        });
    });
}
//# sourceMappingURL=utils.js.map