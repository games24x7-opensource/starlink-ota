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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageDiffer = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const q_1 = __importDefault(require("q"));
const semver_1 = __importDefault(require("semver"));
const stream_1 = __importDefault(require("stream"));
const request = require("superagent");
const streamifier_1 = __importDefault(require("streamifier"));
const superagent_1 = __importDefault(require("superagent"));
const yazl_1 = __importDefault(require("yazl"));
const yauzl_1 = __importDefault(require("yauzl"));
const diffErrorUtils = __importStar(require("./diff-error-handling"));
const env = __importStar(require("../environment"));
const hashUtils = __importStar(require("../utils/hash-utils"));
const security = __importStar(require("../utils/security"));
var PackageManifest = hashUtils.PackageManifest;
var Promise = q_1.default.Promise;
class PackageDiffer {
    constructor(storage, maxPackagesToDiff) {
        this._maxPackagesToDiff = maxPackagesToDiff || 1;
        this._storage = storage;
    }
    generateDiffPackageMap(accountId, appId, deploymentId, newPackage) {
        if (!newPackage || !newPackage.blobUrl || !newPackage.manifestBlobUrl) {
            return q_1.default.reject(diffErrorUtils.diffError(diffErrorUtils.ErrorCode.InvalidArguments, "Package information missing"));
        }
        const manifestPromise = this.getManifest(newPackage);
        const historyPromise = this._storage.getPackageHistory(accountId, appId, deploymentId);
        const newReleaseFilePromise = this.downloadArchiveFromUrl(newPackage.blobUrl);
        let newFilePath;
        return q_1.default
            .all([manifestPromise, historyPromise, newReleaseFilePromise])
            .spread((newManifest, history, downloadedArchiveFile) => {
            newFilePath = downloadedArchiveFile;
            const packagesToDiff = this.getPackagesToDiff(history, newPackage.appVersion, newPackage.packageHash, newPackage.label);
            const diffBlobInfoPromises = [];
            if (packagesToDiff) {
                packagesToDiff.forEach((appPackage) => {
                    diffBlobInfoPromises.push(this.uploadAndGetDiffBlobInfo(accountId, appPackage, newPackage.packageHash, newManifest, newFilePath));
                });
            }
            return q_1.default.all(diffBlobInfoPromises);
        })
            .then((diffBlobInfoList) => {
            // all done, delete the downloaded archive file.
            fs_1.default.unlinkSync(newFilePath);
            if (diffBlobInfoList && diffBlobInfoList.length) {
                let diffPackageMap = null;
                diffBlobInfoList.forEach((diffBlobInfo) => {
                    if (diffBlobInfo && diffBlobInfo.blobInfo) {
                        diffPackageMap = diffPackageMap || {};
                        diffPackageMap[diffBlobInfo.packageHash] = diffBlobInfo.blobInfo;
                    }
                });
                return diffPackageMap;
            }
            else {
                return (0, q_1.default)(null);
            }
        })
            .catch(diffErrorUtils.diffErrorHandler);
    }
    generateDiffArchive(oldManifest, newManifest, newArchiveFilePath) {
        return Promise((resolve, reject, notify) => {
            if (!oldManifest || !newManifest) {
                resolve(null);
                return;
            }
            const diff = PackageDiffer.generateDiff(oldManifest.toMap(), newManifest.toMap());
            if (diff.deletedFiles.length === 0 && diff.newOrUpdatedEntries.size === 0) {
                resolve(null);
                return;
            }
            PackageDiffer.ensureWorkDirectoryExists();
            const diffFilePath = path_1.default.join(PackageDiffer.WORK_DIRECTORY_PATH, "diff_" + PackageDiffer.randomString(20) + ".zip");
            const writeStream = fs_1.default.createWriteStream(diffFilePath);
            const diffFile = new yazl_1.default.ZipFile();
            diffFile.outputStream.pipe(writeStream).on("close", () => {
                resolve(diffFilePath);
            });
            const json = JSON.stringify({ deletedFiles: diff.deletedFiles });
            const readStream = streamifier_1.default.createReadStream(json);
            diffFile.addReadStream(readStream, PackageDiffer.MANIFEST_FILE_NAME);
            if (diff.newOrUpdatedEntries.size > 0) {
                yauzl_1.default.open(newArchiveFilePath, (error, zipFile) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    zipFile
                        .on("error", (error) => {
                        reject(error);
                    })
                        .on("entry", (entry) => {
                        if (!PackageDiffer.isEntryInMap(entry.fileName, /*hash*/ null, diff.newOrUpdatedEntries, /*requireContentMatch*/ false)) {
                            return;
                        }
                        else if (/\/$/.test(entry.fileName)) {
                            // this is a directory
                            diffFile.addEmptyDirectory(entry.fileName);
                            return;
                        }
                        let readStreamCounter = 0; // Counter to track the number of read streams
                        let readStreamError = null; // Error flag for read streams
                        zipFile.openReadStream(entry, (error, readStream) => {
                            if (error) {
                                reject(error);
                                return;
                            }
                            readStreamCounter++;
                            readStream
                                .on("error", (error) => {
                                readStreamError = error;
                                reject(error);
                            })
                                .on("end", () => {
                                readStreamCounter--;
                                if (readStreamCounter === 0 && !readStreamError) {
                                    // All read streams have completed successfully
                                    resolve();
                                }
                            });
                            diffFile.addReadStream(readStream, entry.fileName);
                        });
                        zipFile.on("close", () => {
                            if (readStreamCounter === 0) {
                                // All read streams have completed, no need to wait
                                if (readStreamError) {
                                    reject(readStreamError);
                                }
                                else {
                                    diffFile.end();
                                    resolve();
                                }
                            }
                        });
                    });
                });
            }
            else {
                diffFile.end();
            }
        });
    }
    uploadDiffArchiveBlob(blobId, diffArchiveFilePath) {
        return Promise((resolve, reject, notify) => {
            fs_1.default.stat(diffArchiveFilePath, (err, stats) => {
                if (err) {
                    reject(err);
                    return;
                }
                const readable = fs_1.default.createReadStream(diffArchiveFilePath);
                this._storage
                    .addBlob(blobId, readable, stats.size)
                    .then((blobId) => {
                    return this._storage.getBlobUrl(blobId);
                })
                    .then((blobUrl) => {
                    fs_1.default.unlink(diffArchiveFilePath, (error) => {
                        if (error) {
                            console.error("Error occurred while unlinking file:", error);
                        }
                    });
                    const diffBlobInfo = { size: stats.size, url: blobUrl };
                    resolve(diffBlobInfo);
                })
                    .catch(() => {
                    resolve(null);
                })
                    .done();
            });
        });
    }
    uploadAndGetDiffBlobInfo(accountId, appPackage, newPackageHash, newManifest, newFilePath) {
        if (!appPackage || appPackage.packageHash === newPackageHash) {
            // If the packageHash matches, no need to calculate diff, its the same package.
            return (0, q_1.default)(null);
        }
        return this.getManifest(appPackage)
            .then((existingManifest) => {
            return this.generateDiffArchive(existingManifest, newManifest, newFilePath);
        })
            .then((diffArchiveFilePath) => {
            if (diffArchiveFilePath) {
                return this.uploadDiffArchiveBlob(security.generateSecureKey(accountId), diffArchiveFilePath);
            }
            return (0, q_1.default)(null);
        })
            .then((blobInfo) => {
            if (blobInfo) {
                return { packageHash: appPackage.packageHash, blobInfo: blobInfo };
            }
            else {
                return (0, q_1.default)(null);
            }
        });
    }
    getManifest(appPackage) {
        return Promise((resolve, reject, notify) => {
            if (!appPackage || !appPackage.manifestBlobUrl) {
                resolve(null);
                return;
            }
            const req = superagent_1.default.get(appPackage.manifestBlobUrl);
            const writeStream = new stream_1.default.Writable();
            let json = "";
            writeStream._write = (data, encoding, callback) => {
                json += data.toString("utf8");
                callback();
            };
            req.pipe(writeStream).on("finish", () => {
                const manifest = PackageManifest.deserialize(json);
                resolve(manifest);
            });
        });
    }
    downloadArchiveFromUrl(url) {
        return Promise((resolve, reject, notify) => {
            PackageDiffer.ensureWorkDirectoryExists();
            const downloadedArchiveFilePath = path_1.default.join(PackageDiffer.WORK_DIRECTORY_PATH, "temp_" + PackageDiffer.randomString(20) + ".zip");
            const writeStream = fs_1.default.createWriteStream(downloadedArchiveFilePath);
            const req = request.get(url);
            req.pipe(writeStream).on("finish", () => {
                resolve(downloadedArchiveFilePath);
            });
        });
    }
    getPackagesToDiff(history, appVersion, newPackageHash, newPackageLabel) {
        if (!history || !history.length) {
            return null;
        }
        // We assume that the new package has been released and already is in history.
        // Only pick the packages that are released before the new package to generate diffs.
        let foundNewPackageInHistory = false;
        const validPackages = [];
        for (let i = history.length - 1; i >= 0; i--) {
            if (!foundNewPackageInHistory) {
                foundNewPackageInHistory = history[i].label === newPackageLabel;
                continue;
            }
            if (validPackages.length === this._maxPackagesToDiff) {
                break;
            }
            const isMatchingAppVersion = PackageDiffer.isMatchingAppVersion(appVersion, history[i].appVersion);
            if (isMatchingAppVersion && history[i].packageHash !== newPackageHash) {
                validPackages.push(history[i]);
            }
        }
        // maintain the order of release.
        return validPackages.reverse();
    }
    static generateDiff(oldFileHashes, newFileHashes) {
        const diff = { deletedFiles: [], newOrUpdatedEntries: new Map() };
        newFileHashes.forEach((hash, name) => {
            if (!PackageDiffer.isEntryInMap(name, hash, oldFileHashes, /*requireContentMatch*/ true)) {
                diff.newOrUpdatedEntries.set(name, hash);
            }
        });
        oldFileHashes.forEach((hash, name) => {
            if (!PackageDiffer.isEntryInMap(name, hash, newFileHashes, /*requireContentMatch*/ false)) {
                diff.deletedFiles.push(name);
            }
        });
        return diff;
    }
    static isMatchingAppVersion(baseAppVersion, newAppVersion) {
        let isMatchingAppVersion = false;
        if (!semver_1.default.valid(baseAppVersion)) {
            // baseAppVersion is a semver range
            if (!semver_1.default.valid(newAppVersion)) {
                // newAppVersion is a semver range
                isMatchingAppVersion = semver_1.default.validRange(newAppVersion) === semver_1.default.validRange(baseAppVersion);
            }
            else {
                // newAppVersion is not a semver range
                isMatchingAppVersion = semver_1.default.satisfies(newAppVersion, baseAppVersion);
            }
        }
        else {
            // baseAppVersion is not a semver range
            isMatchingAppVersion = semver_1.default.satisfies(baseAppVersion, newAppVersion);
        }
        return isMatchingAppVersion;
    }
    static ensureWorkDirectoryExists() {
        if (!PackageDiffer.IS_WORK_DIRECTORY_CREATED) {
            if (!fs_1.default.existsSync(PackageDiffer.WORK_DIRECTORY_PATH)) {
                fs_1.default.mkdirSync(PackageDiffer.WORK_DIRECTORY_PATH);
            }
            // Memoize this check to avoid unnecessary file system access.
            PackageDiffer.IS_WORK_DIRECTORY_CREATED = true;
        }
    }
    static isEntryInMap(name, hash, map, requireContentMatch) {
        const hashInMap = map.get(name);
        return requireContentMatch ? hashInMap === hash : !!hashInMap;
    }
    static randomString(length) {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        let str = "";
        for (let i = 0; i < length; i++) {
            str += chars[Math.floor(Math.random() * chars.length)];
        }
        return str;
    }
}
exports.PackageDiffer = PackageDiffer;
PackageDiffer.MANIFEST_FILE_NAME = "hotcodepush.json";
PackageDiffer.WORK_DIRECTORY_PATH = env.getTempDirectory();
PackageDiffer.IS_WORK_DIRECTORY_CREATED = false;
//# sourceMappingURL=package-diffing.js.map