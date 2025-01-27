"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileUploadMiddleware = fileUploadMiddleware;
exports.getFileWithField = getFileWithField;
exports.createTempFileFromBuffer = createTempFileFromBuffer;
const multer = require("multer");
const UPLOAD_SIZE_LIMIT_MB = parseInt(process.env.UPLOAD_SIZE_LIMIT_MB) || 200;
function getAttachUploadFileFunction(maxFileSizeMb) {
    return multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: maxFileSizeMb * 1048576,
        },
    }).any();
}
function fileUploadMiddleware(req, res, next) {
    const maxFileSizeMb = UPLOAD_SIZE_LIMIT_MB;
    const attachUploadFile = getAttachUploadFileFunction(maxFileSizeMb);
    attachUploadFile(req, res, (err) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                res.status(413).send(`The uploaded file is larger than the size limit of ${maxFileSizeMb} megabytes.`);
            }
            else {
                next(err);
            }
        }
        else {
            next();
        }
    });
}
function getFileWithField(req, field) {
    for (const i in req.files) {
        if (req.files[i].fieldname === field) {
            return req.files[i];
        }
    }
    return null;
}
function createTempFileFromBuffer(buffer) {
    const tmpPath = require("os").tmpdir();
    const tmpFilePath = require("path").join(tmpPath, "tempfile");
    require("fs").writeFileSync(tmpFilePath, buffer);
    return tmpFilePath;
}
