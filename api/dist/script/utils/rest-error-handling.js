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
exports.restError = restError;
exports.restErrorHandler = restErrorHandler;
exports.sendMalformedRequestError = sendMalformedRequestError;
exports.sendForbiddenError = sendForbiddenError;
exports.sendForbiddenPage = sendForbiddenPage;
exports.sendNotFoundError = sendNotFoundError;
exports.sendNotRegisteredError = sendNotRegisteredError;
exports.sendConflictError = sendConflictError;
exports.sendAlreadyExistsPage = sendAlreadyExistsPage;
exports.sendResourceGoneError = sendResourceGoneError;
exports.sendResourceGonePage = sendResourceGonePage;
exports.sendTooLargeError = sendTooLargeError;
exports.sendConnectionFailedError = sendConnectionFailedError;
exports.sendUnknownError = sendUnknownError;
const errorModule = __importStar(require("../error"));
const storageTypes = __importStar(require("../storage/storage"));
const passportAuthentication = __importStar(require("../routes/passport-authentication"));
const sanitizeHtml = require("sanitize-html");
var ErrorCode;
(function (ErrorCode) {
    ErrorCode[ErrorCode["Conflict"] = 0] = "Conflict";
    ErrorCode[ErrorCode["MalformedRequest"] = 1] = "MalformedRequest";
    ErrorCode[ErrorCode["NotFound"] = 2] = "NotFound";
    ErrorCode[ErrorCode["Unauthorized"] = 4] = "Unauthorized";
    ErrorCode[ErrorCode["Other"] = 99] = "Other";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
function restError(errorCode, message) {
    const restError = errorModule.codePushError(errorModule.ErrorSource.Rest, message);
    restError.code = errorCode;
    return restError;
}
function restErrorHandler(res, error, next) {
    if (!error || (error.source !== errorModule.ErrorSource.Storage && error.source !== errorModule.ErrorSource.Rest)) {
        console.log("Unknown error source");
        sendUnknownError(res, error, next);
    }
    else if (error.source === errorModule.ErrorSource.Storage) {
        storageErrorHandler(res, error, next);
    }
    else {
        const restError = error;
        switch (restError.code) {
            case ErrorCode.Conflict:
                sendConflictError(res, error.message);
                break;
            case ErrorCode.MalformedRequest:
                sendMalformedRequestError(res, error.message);
                break;
            case ErrorCode.NotFound:
                sendNotFoundError(res, error.message);
                break;
            case ErrorCode.Unauthorized:
                sendForbiddenError(res, error.message);
                break;
            default:
                console.log("Unknown REST error");
                sendUnknownError(res, error, next);
                break;
        }
    }
}
function sendMalformedRequestError(res, message) {
    if (message) {
        res.status(400).send(sanitizeHtml(message));
    }
    else {
        res.sendStatus(400);
    }
}
function sendForbiddenError(res, message) {
    if (message) {
        res.status(403).send(sanitizeHtml(message));
    }
    else {
        res.sendStatus(403);
    }
}
function sendForbiddenPage(res, message) {
    res.status(403).render("message", { message: message });
}
function sendNotFoundError(res, message) {
    if (message) {
        res.status(404).send(sanitizeHtml(message));
    }
    else {
        res.sendStatus(404);
    }
}
function sendNotRegisteredError(res) {
    if (passportAuthentication.PassportAuthentication.isAccountRegistrationEnabled()) {
        res.status(403).render("message", {
            message: "Account not found.<br/>Have you registered with the CLI?<br/>If you are registered but your email address has changed, please contact us.",
        });
    }
    else {
        res.status(403).render("message", {
            message: "Account not found.<br/>Please <a href='http://microsoft.github.io/code-push/'>sign up for the beta</a>, and we will contact you when your account has been created!</a>",
        });
    }
}
function sendConflictError(res, message) {
    message = message ? sanitizeHtml(message) : "The provided resource already exists";
    res.status(409).send(message);
}
function sendAlreadyExistsPage(res, message) {
    res.status(409).render("message", { message: message });
}
function sendResourceGoneError(res, message) {
    res.status(410).send(sanitizeHtml(message));
}
function sendResourceGonePage(res, message) {
    res.status(410).render("message", { message: message });
}
function sendTooLargeError(res) {
    res.status(413).send("The provided resource is too large");
}
function sendConnectionFailedError(res) {
    res.status(503).send("The CodePush server temporarily timed out. Please try again.");
}
function sendUnknownError(res, error, next) {
    error = error || new Error("Unknown error");
    if (typeof error["stack"] === "string") {
        console.log(error["stack"]);
    }
    else {
        console.log(error);
    }
    res.sendStatus(500);
}
function storageErrorHandler(res, error, next) {
    switch (error.code) {
        case storageTypes.ErrorCode.NotFound:
            sendNotFoundError(res, error.message);
            break;
        case storageTypes.ErrorCode.AlreadyExists:
            sendConflictError(res, error.message);
            break;
        case storageTypes.ErrorCode.TooLarge:
            sendTooLargeError(res);
            break;
        case storageTypes.ErrorCode.ConnectionFailed:
            sendConnectionFailedError(res);
            break;
        case storageTypes.ErrorCode.Invalid:
            sendMalformedRequestError(res, error.message);
            break;
        case storageTypes.ErrorCode.Other:
        default:
            console.log("Unknown storage error.");
            sendUnknownError(res, error, next);
            break;
    }
}
//# sourceMappingURL=rest-error-handling.js.map