import AWS from "aws-sdk";
import { Readable } from "stream";
import redisMock from "redis-mock";
import AWSMock from "aws-sdk-mock";

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
      if (params.Key.partitionKey === "health") {
        console.log("Successfully connected to DynamoDB::from mock");
        return callback(null, {
          Item: {
            partitionKey: "health",
            rowKey: "health",
            timestamp: Date.now(),
          },
        });
      }

      // Mock deployment info lookup
      if (params.Key.deploymentKey) {
        return callback(null, {
          Item: {
            deploymentKey: params.Key.deploymentKey,
            packageHash: "test-hash-123",
            appVersion: "1.0.0",
            isDisabled: false,
            isMandatory: false,
            releaseMethod: "Upload",
            rollout: 100,
            size: 1000,
            uploadTime: Date.now(),
          },
        });
      }
    }
    callback(null, { Item: null });
  });

  AWSMock.mock("DynamoDB.DocumentClient", "query", (params: any, callback: Function) => {
    callback(null, {
      Items: [
        {
          deploymentKey: "test-key",
          packageHash: "test-hash-123",
          appVersion: "1.0.0",
          isDisabled: false,
          isMandatory: false,
        },
      ],
    });
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
    mock.RedisClient.prototype.hincrby = function (hash, field, value, cb) {
      cb(null, 1);
    };
    mock.RedisClient.prototype.hgetall = function (hash, cb) {
      cb(null, {
        "metrics.v1.downloaded": "1",
        "metrics.v1.installed": "1",
      });
    };
    mock.RedisClient.prototype.multi = function () {
      return {
        hincrby: function () {
          return this;
        },
        exec: function (cb) {
          cb(null, [1, 1]);
        },
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
