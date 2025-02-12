"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_KEY_CHARACTERS_TEST = void 0;
exports.generateSecureKey = generateSecureKey;
const crypto_1 = __importDefault(require("crypto"));
exports.ALLOWED_KEY_CHARACTERS_TEST = /^[a-zA-Z0-9_-]+$/;
function generateSecureKey(accountId) {
    return crypto_1.default
        .randomBytes(21)
        .toString("base64")
        .replace(/\+/g, "_") // URL-friendly characters
        .replace(/\//g, "-")
        .replace(/^-/, "_") // no '-' in the beginning
        .concat(accountId);
}
//# sourceMappingURL=security.js.map