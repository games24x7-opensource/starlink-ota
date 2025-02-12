"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertObjectToSnakeCase = convertObjectToSnakeCase;
exports.streamToBuffer = streamToBuffer;
exports.hashWithSHA256 = hashWithSHA256;
const streamToArray = require("stream-to-array");
const crypto = require("crypto");
function toSnakeCase(str) {
    return str
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .toLowerCase();
}
function convertObjectToSnakeCase(obj) {
    if (typeof obj !== "object" || obj === null) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => convertObjectToSnakeCase(item));
    }
    return Object.keys(obj).reduce((acc, key) => {
        const snakeCaseKey = toSnakeCase(key);
        acc[snakeCaseKey] = convertObjectToSnakeCase(obj[key]);
        return acc;
    }, {});
}
function streamToBuffer(readableStream) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            streamToArray(readableStream, (err, arr) => {
                if (err) {
                    reject(err);
                }
                else {
                    const buffers = arr.map((chunk) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                    const concatenatedBuffer = Buffer.concat(buffers);
                    resolve(concatenatedBuffer.buffer);
                }
            });
        });
    });
}
function hashWithSHA256(input) {
    const hash = crypto.createHash("sha256");
    hash.update(input);
    return hash.digest("hex");
}
//# sourceMappingURL=common.js.map