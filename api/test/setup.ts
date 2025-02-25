import AWS from "aws-sdk";
import { Readable } from "stream";
import redisMock from "redis-mock";
import AWSMock from "aws-sdk-mock";

// Mock controller to simulate Redis failures
export const mockController = {
  shouldRedisOperationsFail: false,
  redisError: new Error("Redis operation failed"),
};

// ===== Environment Setup =====
const setupEnvironment = () => {
  process.env.NODE_ENV = "test";
  process.env.AWS_REGION = "ap-south-1";

  // Redis config
  process.env.REDIS_HOST = "localhost";
  process.env.REDIS_PORT = "6379";

  // AWS S3 config
  process.env.PACKAGE_HISTORY_S3_BUCKET_NAME = "test-package-history";
  process.env.PACKAGE_HISTORY_S3_PREFIX = "ota-history/package-history";
  process.env.PACKAGE_DOWNLOAD_CDN_S3_BUCKET_NAME = "test-package-download";
  process.env.PACKAGE_DOWNLOAD_CDN_S3_PREFIX = "ota-releases/package-downloads";
  process.env.PACKAGE_DOWNLOAD_CDN_URL = "https://test-cdn.example.com";

  // DynamoDB config
  process.env.TABLE_NAME = "ota-registery";

  // Feature flags
  process.env.LOGGING = "false";
  process.env.DEBUG_DISABLE_AUTH = "true";
  process.env.DISABLE_ACQUISITION = "false";
  process.env.DISABLE_MANAGEMENT = "false";
  process.env.ENABLE_PACKAGE_DIFFING = "true";
};

// ===== AWS Mocks =====
const setupAWSMocks = () => {
  AWSMock.setSDKInstance(AWS);

  // DynamoDB Mocks
  AWSMock.mock("DynamoDB.DocumentClient", "get", (params: any, callback: Function) => {
    if (params.TableName === process.env.TABLE_NAME) {
      // Extract key parts
      const [prefix, key] = (params.Key.partitionKey || "").split(" ");

      if (prefix === "deploymentKey") {
        if (key === "test-key") {
          return callback(null, {
            Item: {
              deploymentKey: "test-key",
              packageHash: "test-hash-123",
              appVersion: "1.0.0",
              isDisabled: false,
              isMandatory: false,
              releaseMethod: "Upload",
              rollout: 100,
              size: 1000,
              uploadTime: Date.now(),
              label: "v1",
              description: "Test update",
              blobUrl: "https://test-cdn.example.com/test-package",
              packageSize: 1024,
              isEnabled: true,
              isSynced: true,
              status: "Active",
              partitionKey: params.Key.partitionKey,
              rowKey: "DeploymentKeyRowKey",
            },
          });
        }
      } else if (params.Key.partitionKey === "health" && params.Key.rowKey === "health") {
        return callback(null, {
          Item: {
            partitionKey: "health",
            rowKey: "health",
            timestamp: Date.now(),
          },
        });
      }
    }

    callback(null, { Item: null });
  });

  AWSMock.mock("DynamoDB.DocumentClient", "query", (params: any, callback: Function) => {
    if (params.TableName === process.env.TABLE_NAME) {
      const [prefix, key] = (params.ExpressionAttributeValues?.[":deploymentKey"] || "").split(" ");

      if (prefix === "deploymentKey" && key === "test-key") {
        callback(null, {
          Items: [
            {
              deploymentKey: "test-key",
              packageHash: "test-hash-123",
              appVersion: "1.0.0",
              isDisabled: false,
              isMandatory: false,
              label: "v1",
              description: "Test update",
              packageSize: 1024,
              blobUrl: "https://test-cdn.example.com/test-package",
              uploadTime: Date.now(),
              rollout: 100,
              releaseMethod: "Upload",
              size: 1024,
              partitionKey: params.ExpressionAttributeValues?.[":deploymentKey"],
              rowKey: "DeploymentKeyRowKey",
            },
          ],
        });
      } else {
        callback(null, { Items: [] });
      }
    }
  });

  AWSMock.mock("DynamoDB.DocumentClient", "put", (params: any, callback: Function) => {
    callback(null, {});
  });

  AWSMock.mock("DynamoDB.DocumentClient", "update", (params: any, callback: Function) => {
    callback(null, {});
  });

  AWSMock.mock("DynamoDB.DocumentClient", "delete", (params: any, callback: Function) => {
    callback(null, {});
  });

  // S3 Mocks
  AWSMock.mock("S3", "putObject", (params: any, callback: Function) => {
    callback(null, { ETag: "mock-etag" });
  });

  AWSMock.mock("S3", "getObject", (params: any, callback: Function) => {
    callback(null, {
      Body: Readable.from([
        JSON.stringify({
          packageHash: "test-hash-123",
          appVersion: "1.0.0",
          isDisabled: false,
          isMandatory: false,
          description: "Test package",
          blobUrl: "https://test-cdn.example.com/test-package",
          size: 1000,
          releaseMethod: "Upload",
          uploadTime: Date.now(),
          label: "v1",
        }),
      ]),
      ContentLength: 100,
      LastModified: new Date(),
    });
  });

  AWSMock.mock("S3", "deleteObject", (params: any, callback: Function) => {
    callback(null, {});
  });
};

// ===== Other Service Mocks =====
const setupServiceMocks = () => {
  // Mock validation utils
  jest.mock("../script/utils/validation", () => ({
    isValidUpdateCheckRequest: (request: any) => {
      return true;
    },
    isValidKeyField: (key: string) => {
      return true;
    },
    isValidAppVersionField: (version: string) => {
      return true;
    },
  }));

  // Logger Mock
  jest.mock("../script/logger", () => {
    class Logger {
      static currentLogger: any = null;

      static info(message: string) {
        Logger.currentLogger = new Logger();
        return Logger.currentLogger;
      }

      static error(message: string) {
        Logger.currentLogger = new Logger();
        return Logger.currentLogger;
      }

      static warn(message: string) {
        Logger.currentLogger = new Logger();
        return Logger.currentLogger;
      }

      static debug(message: string) {
        Logger.currentLogger = new Logger();
        return Logger.currentLogger;
      }

      setExpressReq(req: any) {
        return this;
      }

      setUpstreamRequestParams(requestParams: any) {
        return this;
      }

      setUpstreamResponse(response: any) {
        return this;
      }

      setData(data: any) {
        return this;
      }

      setError(error: any) {
        return this;
      }

      log() {
        // Do nothing in tests
      }
    }

    return Logger;
  });

  // Redis Mock with proper metrics handling
  jest.mock("redis", () => {
    const mock = redisMock;
    // Helper to promisify callbacks
    const promisify = (fn: Function) => {
      return (...args: any[]) => {
        return new Promise((resolve, reject) => {
          if (mockController.shouldRedisOperationsFail) {
            reject(mockController.redisError);
            return;
          }
          fn(...args, (err: Error | null, result: any) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      };
    };

    mock.RedisClient.prototype.get = function (key: string, cb: Function) {
      if (mockController.shouldRedisOperationsFail) {
        cb(mockController.redisError);
        return;
      }
      cb(null, null);
    };

    mock.RedisClient.prototype.hincrby = function (hash, field, value, cb) {
      if (mockController.shouldRedisOperationsFail) {
        cb(mockController.redisError);
        return;
      }
      cb(null, 1);
    };

    mock.RedisClient.prototype.multi = function () {
      return {
        hincrby: function () {
          return this;
        },
        set: function () {
          return this;
        },
        expire: function () {
          return this;
        },
        exec: function (cb) {
          if (mockController.shouldRedisOperationsFail) {
            cb(mockController.redisError);
            return;
          }
          cb(null, [1, 1, "OK", 1]);
        },
      };
    };

    mock.RedisClient.prototype.exists = function (key: string, cb: Function) {
      if (mockController.shouldRedisOperationsFail) {
        cb(mockController.redisError);
        return;
      }
      cb(null, 1);
    };

    // Add promisified versions
    mock.RedisClient.prototype.getAsync = promisify(mock.RedisClient.prototype.get);
    mock.RedisClient.prototype.hincrbyAsync = promisify(mock.RedisClient.prototype.hincrby);
    mock.RedisClient.prototype.existsAsync = promisify(mock.RedisClient.prototype.exists);
    mock.RedisClient.prototype.multiAsync = function () {
      const multi = this.multi();
      return {
        ...multi,
        execAsync: promisify(multi.exec),
      };
    };

    return mock;
  });
};

// ===== Initialize Test Environment =====
setupEnvironment();
setupAWSMocks();
setupServiceMocks();

// ===== Exports =====
export const mockAWS = {
  dynamo: {
    get: (mockFn: Function) => AWSMock.remock("DynamoDB.DocumentClient", "get", mockFn),
    query: (mockFn: Function) => AWSMock.remock("DynamoDB.DocumentClient", "query", mockFn),
    put: (mockFn: Function) => AWSMock.remock("DynamoDB.DocumentClient", "put", mockFn),
    update: (mockFn: Function) => AWSMock.remock("DynamoDB.DocumentClient", "update", mockFn),
    delete: (mockFn: Function) => AWSMock.remock("DynamoDB.DocumentClient", "delete", mockFn),
  },
  s3: {
    putObject: (mockFn: Function) => AWSMock.remock("S3", "putObject", mockFn),
    getObject: (mockFn: Function) => AWSMock.remock("S3", "getObject", mockFn),
    deleteObject: (mockFn: Function) => AWSMock.remock("S3", "deleteObject", mockFn),
  },
};

export const awsMock = {
  s3: new AWS.S3(),
  dynamoDB: new AWS.DynamoDB.DocumentClient(),
  mock: mockAWS,
};

export const resetMocks = () => {
  jest.clearAllMocks();
  jest.resetAllMocks();
  AWSMock.restore();
  setupAWSMocks();
};
