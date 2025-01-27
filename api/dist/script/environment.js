"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTempDirectory = getTempDirectory;
function getTempDirectory() {
    return process.env.TEMP || process.env.TMPDIR;
}
