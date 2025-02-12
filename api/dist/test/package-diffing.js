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
const json_storage_1 = require("../script/storage/json-storage");
const assert_1 = __importDefault(require("assert"));
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const shortid_1 = __importDefault(require("shortid"));
const hashUtils = __importStar(require("../script/utils/hash-utils"));
const packageDiffing = __importStar(require("../script/utils/package-diffing"));
const utils = __importStar(require("./utils"));
const yauzl = __importStar(require("yauzl"));
var PackageDiffer = packageDiffing.PackageDiffer;
var PackageManifest = hashUtils.PackageManifest;
const Pend = require("pend");
describe("Package diffing with JSON storage", () => packageDiffTests(json_storage_1.JsonStorage));
function packageDiffTests(StorageType) {
    const TEST_ARCHIVE_FILE_NAMES = ["test.zip", "test2.zip", "test3.zip", "test4.zip"];
    const TEST_ARCHIVE_FILE_PATH = path_1.default.join(__dirname, "resources", TEST_ARCHIVE_FILE_NAMES[0]);
    const TEST_ARCHIVE_WITH_FOLDERS_FILE_PATH = path_1.default.join(__dirname, "resources", "testdirectories.zip");
    const TEST_ZIP_HASH = "540fed8df3553079e81d1353c5cc4e3cac7db9aea647a85d550f646e8620c317";
    const TEST_ZIP_MANIFEST_HASH = "9e0499ce7df5c04cb304c9deed684dc137fc603cb484a5b027478143c595d80b";
    const HASH_A = "418dd73df63bfe1dc9b1d126d340ccf4941198ccf573eff190a6ff8dc69e87e4";
    const HASH_B = "3e23e8160039594a33894f6564e1b1348bbd7a0088d42c4acb73eeaed59c009d";
    const HASH_C = "2e7d2c03a9507ae265ecf5b5356885a53393a2029d241394997265a1a25aefc6";
    const HASH_D = "18ac3e7343f016890c510e93f935261169d9e3f565436429830faf0934f4f8e4";
    const MANIFEST_HASH = "9a5b5530de83276462aba1f936a7d341629dddfa86705cf4b8e84365bd828c08";
    const FOLDER_A_HASH = "c8e61e0c7e666745a4066a42ef37fca0ca519a52f695201bd387fbcb4e019cb2";
    const FOLDER_B_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const HOT_CODE_PUSH_JSON_HASH = "3a2de62a9c2b64b3ac2ccdfd113a0c758e5acb66882fdf270e3f36ecc417a96d";
    var storage;
    var packageDiffingUtils;
    // Spin up a server to serve the blob.
    var server;
    before(() => {
        storage = new StorageType();
        packageDiffingUtils = new PackageDiffer(storage, /*maxPackagesToDiff*/ 5);
        var app = (0, express_1.default)();
        app.use("/", express_1.default.static(path_1.default.join(__dirname, "resources")));
        var port = 3000;
        server = app.listen(port);
    });
    // Kill the server.
    after(() => {
        server.close();
    });
    describe("Package diffing utility (general)", () => {
        it("generates an incremental update package", (done) => {
            var oldManifest = new PackageManifest(new Map()
                .set("a.txt", HASH_A) // This file is removed in the new manifest.  The diff's hotcodepush.json file will reference this file.
                .set("b.txt", HASH_B) // This file is unchanged in the new manifest and will not be present in the diff.
                .set("c.txt", "previoushash")); // This file will change in the new manifest.  The diff will contain the newer version of this file.
            var newManifest = new PackageManifest(new Map().set("b.txt", HASH_B).set("c.txt", HASH_C).set("d.txt", HASH_D)); // This file is new as of the new manifest.  The diff will contain this file.
            var expectedDiffContents = new Map()
                .set("c.txt", HASH_C)
                .set("d.txt", HASH_D)
                .set("hotcodepush.json", MANIFEST_HASH);
            packageDiffingUtils
                .generateDiffArchive(oldManifest, newManifest, TEST_ARCHIVE_FILE_PATH)
                .done((diffArchiveFilePath) => {
                fs_1.default.exists(diffArchiveFilePath, (exists) => {
                    assert_1.default.ok(exists);
                    // Now verify that the diff package contents are correct.
                    yauzl.open(diffArchiveFilePath, (error, zipFile) => {
                        if (error) {
                            throw error;
                        }
                        var pend = new Pend();
                        zipFile
                            .on("error", (error) => {
                            throw error;
                        })
                            .on("entry", (entry) => {
                            zipFile.openReadStream(entry, (error, readStream) => {
                                if (error) {
                                    throw error;
                                }
                                pend.go((callback) => {
                                    hashUtils
                                        .hashStream(readStream)
                                        .then((actualHash) => {
                                        var expectedHash = expectedDiffContents.get(entry.fileName);
                                        var error;
                                        if (actualHash !== expectedHash) {
                                            error = new Error('The hash did not match for file "' +
                                                entry.fileName +
                                                '".  Expected hash:  ' +
                                                expectedHash +
                                                ".  Actual hash:  " +
                                                actualHash +
                                                ".");
                                        }
                                        expectedDiffContents.delete(entry.fileName);
                                        callback(error);
                                    }, callback)
                                        .done();
                                });
                            });
                        })
                            .on("close", () => {
                            pend.wait((error) => {
                                if (error) {
                                    throw error;
                                }
                                if (expectedDiffContents.size !== 0) {
                                    throw new Error("The diff archive contents were incorrect.");
                                }
                                fs_1.default.unlinkSync(diffArchiveFilePath);
                                done();
                            });
                        });
                    });
                });
            });
        });
        it("generates an incremental update package with new folders", (done) => {
            var oldManifest = new PackageManifest(new Map().set("www/folderA/", FOLDER_A_HASH));
            var newManifest = new PackageManifest(new Map().set("www/folderA/", FOLDER_A_HASH).set("www/folderB/", FOLDER_B_HASH)); // This folder is a new folder that did not appear in the previous package manifest;
            var expectedDiffContents = new Map()
                .set("www/folderB/", FOLDER_B_HASH)
                .set("hotcodepush.json", HOT_CODE_PUSH_JSON_HASH);
            packageDiffingUtils
                .generateDiffArchive(oldManifest, newManifest, TEST_ARCHIVE_WITH_FOLDERS_FILE_PATH)
                .done((diffArchiveFilePath) => {
                fs_1.default.exists(diffArchiveFilePath, (exists) => {
                    assert_1.default.ok(exists);
                    // Now verify that the diff package contents are correct.
                    yauzl.open(diffArchiveFilePath, (error, zipFile) => {
                        if (error) {
                            throw error;
                        }
                        var pend = new Pend();
                        zipFile
                            .on("error", (error) => {
                            throw error;
                        })
                            .on("entry", (entry) => {
                            zipFile.openReadStream(entry, (error, readStream) => {
                                if (error) {
                                    throw error;
                                }
                                pend.go((callback) => {
                                    hashUtils
                                        .hashStream(readStream)
                                        .then((actualHash) => {
                                        var expectedHash = expectedDiffContents.get(entry.fileName);
                                        var error;
                                        if (actualHash !== expectedHash) {
                                            error = new Error('The hash did not not match for file "' +
                                                entry.fileName +
                                                '".  Expected hash:  ' +
                                                expectedHash +
                                                ".  Actual hash:  " +
                                                actualHash +
                                                ".");
                                        }
                                        expectedDiffContents.delete(entry.fileName);
                                        callback(error);
                                    }, callback)
                                        .done();
                                });
                            });
                        })
                            .on("close", () => {
                            pend.wait((error) => {
                                if (error) {
                                    throw error;
                                }
                                if (expectedDiffContents.size !== 0) {
                                    throw new Error("The diff archive contents were incorrect.");
                                }
                                fs_1.default.unlinkSync(diffArchiveFilePath);
                                done();
                            });
                        });
                    });
                });
            });
        });
    });
    function uploadAndGetPackageInfo(filePath) {
        var info = { packageHash: null, blobUrl: null, manifestBlobUrl: null };
        var manifest;
        return hashUtils
            .generatePackageManifestFromZip(filePath)
            .then((retrievedManifest) => {
            manifest = retrievedManifest;
            return manifest.computePackageHash();
        })
            .then((packageHash) => {
            info.packageHash = packageHash;
            var json = manifest.serialize();
            return storage.addBlob(shortid_1.default.generate(), utils.makeStreamFromString(json), json.length);
        })
            .then((blobId) => {
            return storage.getBlobUrl(blobId);
        })
            .then((savedManifestBlobUrl) => {
            info.manifestBlobUrl = savedManifestBlobUrl;
            return utils.getStreamAndSizeForFile(filePath);
        })
            .then((props) => {
            return storage.addBlob(shortid_1.default.generate(), props.stream, props.size);
        })
            .then((blobId) => {
            return storage.getBlobUrl(blobId);
        })
            .then((savedBlobUrl) => {
            info.blobUrl = savedBlobUrl;
            return info;
        });
    }
    function failOnCallSucceeded(result) {
        throw new Error("Expected the promise to be rejected, but it succeeded with value " + (result ? JSON.stringify(result) : result));
    }
}
//# sourceMappingURL=package-diffing.js.map