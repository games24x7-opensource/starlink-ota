"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputSanitizer = InputSanitizer;
function InputSanitizer(req, res, next) {
    if (req.query) {
        req.query.deploymentKey = trimInvalidCharacters((req.query.deploymentKey || req.query.deployment_key));
    }
    next();
}
function trimInvalidCharacters(text) {
    return text && text.trim();
}
