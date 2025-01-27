"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageDiffer = void 0;
const diffErrorUtils = require("./diff-error-handling");
const env = require("../environment");
const fs = require("fs");
const hashUtils = require("../utils/hash-utils");
const path = require("path");
const q = require("q");
const security = require("../utils/security");
const semver = require("semver");
const stream = require("stream");
const streamifier = require("streamifier");
const superagent = require("superagent");
const yazl = require("yazl");
const yauzl = require("yauzl");
var PackageManifest = hashUtils.PackageManifest;
var Promise = q.Promise;
const request = require("superagent");
class PackageDiffer {
    static MANIFEST_FILE_NAME = "hotcodepush.json";
    static WORK_DIRECTORY_PATH = env.getTempDirectory();
    static IS_WORK_DIRECTORY_CREATED = false;
    _storage;
    _maxPackagesToDiff;
    constructor(storage, maxPackagesToDiff) {
        this._maxPackagesToDiff = maxPackagesToDiff || 1;
        this._storage = storage;
    }
    generateDiffPackageMap(accountId, appId, deploymentId, newPackage) {
        if (!newPackage || !newPackage.blobUrl || !newPackage.manifestBlobUrl) {
            return q.reject(diffErrorUtils.diffError(diffErrorUtils.ErrorCode.InvalidArguments, "Package information missing"));
        }
        const manifestPromise = this.getManifest(newPackage);
        const historyPromise = this._storage.getPackageHistory(accountId, appId, deploymentId);
        const newReleaseFilePromise = this.downloadArchiveFromUrl(newPackage.blobUrl);
        let newFilePath;
        return q
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
            return q.all(diffBlobInfoPromises);
        })
            .then((diffBlobInfoList) => {
            // all done, delete the downloaded archive file.
            fs.unlinkSync(newFilePath);
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
                return q(null);
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
            const diffFilePath = path.join(PackageDiffer.WORK_DIRECTORY_PATH, "diff_" + PackageDiffer.randomString(20) + ".zip");
            const writeStream = fs.createWriteStream(diffFilePath);
            const diffFile = new yazl.ZipFile();
            diffFile.outputStream.pipe(writeStream).on("close", () => {
                resolve(diffFilePath);
            });
            const json = JSON.stringify({ deletedFiles: diff.deletedFiles });
            const readStream = streamifier.createReadStream(json);
            diffFile.addReadStream(readStream, PackageDiffer.MANIFEST_FILE_NAME);
            if (diff.newOrUpdatedEntries.size > 0) {
                yauzl.open(newArchiveFilePath, (error, zipFile) => {
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
            fs.stat(diffArchiveFilePath, (err, stats) => {
                if (err) {
                    reject(err);
                    return;
                }
                const readable = fs.createReadStream(diffArchiveFilePath);
                this._storage
                    .addBlob(blobId, readable, stats.size)
                    .then((blobId) => {
                    return this._storage.getBlobUrl(blobId);
                })
                    .then((blobUrl) => {
                    fs.unlink(diffArchiveFilePath, (error) => {
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
            return q(null);
        }
        return this.getManifest(appPackage)
            .then((existingManifest) => {
            return this.generateDiffArchive(existingManifest, newManifest, newFilePath);
        })
            .then((diffArchiveFilePath) => {
            if (diffArchiveFilePath) {
                return this.uploadDiffArchiveBlob(security.generateSecureKey(accountId), diffArchiveFilePath);
            }
            return q(null);
        })
            .then((blobInfo) => {
            if (blobInfo) {
                return { packageHash: appPackage.packageHash, blobInfo: blobInfo };
            }
            else {
                return q(null);
            }
        });
    }
    getManifest(appPackage) {
        return Promise((resolve, reject, notify) => {
            if (!appPackage || !appPackage.manifestBlobUrl) {
                resolve(null);
                return;
            }
            const req = superagent.get(appPackage.manifestBlobUrl);
            const writeStream = new stream.Writable();
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
            const downloadedArchiveFilePath = path.join(PackageDiffer.WORK_DIRECTORY_PATH, "temp_" + PackageDiffer.randomString(20) + ".zip");
            const writeStream = fs.createWriteStream(downloadedArchiveFilePath);
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
        if (!semver.valid(baseAppVersion)) {
            // baseAppVersion is a semver range
            if (!semver.valid(newAppVersion)) {
                // newAppVersion is a semver range
                isMatchingAppVersion = semver.validRange(newAppVersion) === semver.validRange(baseAppVersion);
            }
            else {
                // newAppVersion is not a semver range
                isMatchingAppVersion = semver.satisfies(newAppVersion, baseAppVersion);
            }
        }
        else {
            // baseAppVersion is not a semver range
            isMatchingAppVersion = semver.satisfies(baseAppVersion, newAppVersion);
        }
        return isMatchingAppVersion;
    }
    static ensureWorkDirectoryExists() {
        if (!PackageDiffer.IS_WORK_DIRECTORY_CREATED) {
            if (!fs.existsSync(PackageDiffer.WORK_DIRECTORY_PATH)) {
                fs.mkdirSync(PackageDiffer.WORK_DIRECTORY_PATH);
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
