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
exports.ErrorCode = void 0;
exports.diffError = diffError;
exports.diffErrorHandler = diffErrorHandler;
const errorModule = __importStar(require("../error"));
const storageTypes = __importStar(require("../storage/storage"));
var ErrorCode;
(function (ErrorCode) {
    ErrorCode[ErrorCode["InvalidArguments"] = 0] = "InvalidArguments";
    ErrorCode[ErrorCode["ConnectionFailed"] = 1] = "ConnectionFailed";
    ErrorCode[ErrorCode["ProcessingFailed"] = 2] = "ProcessingFailed";
    ErrorCode[ErrorCode["Other"] = 99] = "Other";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
function diffError(errorCode, message) {
    const diffError = errorModule.codePushError(errorModule.ErrorSource.Diffing, message);
    diffError.code = errorCode;
    return diffError;
}
function diffErrorHandler(error) {
    if (error.source === errorModule.ErrorSource.Storage) {
        let handledError;
        switch (error.code) {
            case storageTypes.ErrorCode.NotFound:
                handledError = diffError(ErrorCode.ProcessingFailed, "Unable to fetch data from storage, not found");
                break;
            case storageTypes.ErrorCode.ConnectionFailed:
                handledError = diffError(ErrorCode.ConnectionFailed, "Error retrieving data from storage, connection failed.");
                break;
            default:
                handledError = diffError(ErrorCode.Other, error.message || "Unknown error");
                break;
        }
        throw handledError;
    }
    else {
        throw error;
    }
}
//# sourceMappingURL=diff-error-handling.js.map