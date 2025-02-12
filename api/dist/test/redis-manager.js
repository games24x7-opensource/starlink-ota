"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const q_1 = __importDefault(require("q"));
const shortid_1 = __importDefault(require("shortid"));
const redis_manager_1 = require("../script/redis-manager");
class DummyExpressResponse {
    status(statusCode) {
        (0, assert_1.default)(!this.statusCode);
        this.statusCode = statusCode;
        return this;
    }
    send(body) {
        (0, assert_1.default)(!this.body);
        this.body = body;
        return this;
    }
    reset() {
        delete this.statusCode;
        delete this.body;
        this.locals = {};
    }
}
var redisManager = new redis_manager_1.RedisManager();
if (!redisManager.isEnabled) {
    console.log("Redis is not configured... Skipping redis tests");
}
else {
    describe("Redis Cache", redisTests);
}
function redisTests() {
    var dummyExpressResponse = new DummyExpressResponse();
    var expectedResponse = {
        statusCode: 200,
        body: "",
    };
    var responseGenerator = () => {
        return (0, q_1.default)(expectedResponse);
    };
    after(() => {
        return redisManager.close();
    });
    it("should be healthy by default", () => {
        return redisManager.checkHealth();
    });
    it("first cache request should return null", () => {
        var expiryKey = "test:" + shortid_1.default.generate();
        var url = shortid_1.default.generate();
        return redisManager.getCachedResponse(expiryKey, url).then((cacheResponse) => {
            assert_1.default.strictEqual(cacheResponse, null);
        });
    });
    it("Should get cache request after setting it once", () => {
        var expiryKey = "test:" + shortid_1.default.generate();
        var url = shortid_1.default.generate();
        expectedResponse.statusCode = 200;
        expectedResponse.body = "I am cached";
        return redisManager
            .getCachedResponse(expiryKey, url)
            .then((cacheResponse) => {
            assert_1.default.strictEqual(cacheResponse, null);
            return redisManager.setCachedResponse(expiryKey, url, expectedResponse);
        })
            .then(() => {
            return redisManager.getCachedResponse(expiryKey, url);
        })
            .then((cacheResponse) => {
            assert_1.default.equal(cacheResponse.statusCode, expectedResponse.statusCode);
            assert_1.default.equal(cacheResponse.body, expectedResponse.body);
            return redisManager.getCachedResponse(expiryKey, url);
        })
            .then((cacheResponse) => {
            assert_1.default.equal(cacheResponse.statusCode, expectedResponse.statusCode);
            assert_1.default.equal(cacheResponse.body, expectedResponse.body);
            var newUrl = shortid_1.default.generate();
            return redisManager.getCachedResponse(expiryKey, newUrl);
        })
            .then((cacheResponse) => {
            assert_1.default.strictEqual(cacheResponse, null);
        });
    });
    it("should be able to invalidate cached request", () => {
        var expiryKey = "test:" + shortid_1.default.generate();
        var url = shortid_1.default.generate();
        expectedResponse.statusCode = 200;
        expectedResponse.body = "I am cached";
        return redisManager
            .getCachedResponse(expiryKey, url)
            .then((cacheResponse) => {
            assert_1.default.strictEqual(cacheResponse, null);
            return redisManager.setCachedResponse(expiryKey, url, expectedResponse);
        })
            .then(() => {
            return redisManager.getCachedResponse(expiryKey, url);
        })
            .then((cacheResponse) => {
            assert_1.default.equal(cacheResponse.statusCode, expectedResponse.statusCode);
            assert_1.default.equal(cacheResponse.body, expectedResponse.body);
            expectedResponse.body = "I am a new body";
            return redisManager.invalidateCache(expiryKey);
        })
            .then(() => {
            return redisManager.getCachedResponse(expiryKey, url);
        })
            .then((cacheResponse) => {
            assert_1.default.strictEqual(cacheResponse, null);
        });
    });
}
//# sourceMappingURL=redis-manager.js.map