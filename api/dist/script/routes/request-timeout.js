"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestTimeoutHandler = RequestTimeoutHandler;
const REQUEST_TIMEOUT_IN_MILLISECONDS = parseInt(process.env.REQUEST_TIMEOUT_IN_MILLISECONDS) || 120000;
function RequestTimeoutHandler(req, res, next) {
    req.setTimeout(REQUEST_TIMEOUT_IN_MILLISECONDS, () => {
        res.sendStatus(408);
    });
    next();
}
