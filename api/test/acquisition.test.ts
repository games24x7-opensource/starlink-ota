import express from "express";
import request from "supertest";
import { getAcquisitionRouter } from "../script/routes/acquisition";
import { RedisManager } from "../script/redis-manager";
import { AwsStorage } from "../script/storage/aws-storage";
import { resetMocks } from "./setup";
import { mockController } from "./setup";

describe("Acquisition APIs", () => {
  let app: express.Express;
  let storage: AwsStorage;
  let redisManager: RedisManager;

  beforeEach(() => {
    resetMocks();
    app = express();
    storage = new AwsStorage("test-bucket", "us-east-1");
    redisManager = new RedisManager();

    app.use(express.json());
    app.use("/", getAcquisitionRouter({ storage, redisManager }));
  });

  describe("GET /updateCheck", () => {
    beforeEach(() => {
      mockController.shouldRedisOperationsFail = false;
      const spy = jest.spyOn(storage, "getPackageHistoryFromDeploymentKey" as keyof typeof storage);
    });

    // it("returns 200 for valid deploymentKey", async () => {
    //   console.log("Starting valid key test");
    //   const params = {
    //     deploymentKey: "test-key",
    //     appVersion: "1.0.0",
    //     clientUniqueId: "device1",
    //   };
    //   console.log("Request params:", params);
    //   const response = await request(app).get("/updateCheck").query(params);

    //   console.log("Response status:", response.status);
    //   console.log("Response body:", response.body);

    //   expect(response.status).toBe(200);
    // });

    it("returns 400 for missing required params", async () => {
      await request(app).get("/updateCheck").expect(400);
    });

    it("returns 400 for invalid deploymentkey", async () => {
      await request(app)
        .get("/updateCheck")
        .query({
          deploymentKey: "invalid-key",
          appVersion: "1.0.0",
          clientUniqueId: "device1",
        })
        .expect(400);
    });

    // it("handles snake_case query parameters", async () => {
    //   await request(app)
    //     .get("/updateCheck")
    //     .query({
    //       deployment_key: "test-key",
    //       app_version: "1.0.0",
    //       client_unique_id: "device1",
    //     })
    //     .expect(200);
    // });

    // it("handles package hash in query", async () => {
    //   await request(app)
    //     .get("/updateCheck")
    //     .query({
    //       deploymentKey: "test-key",
    //       appVersion: "1.0.0",
    //       clientUniqueId: "device1",
    //       packageHash: "hash123",
    //     })
    //     .expect(200);
    // });

    // it("handles companion app flag", async () => {
    //   await request(app)
    //     .get("/updateCheck")
    //     .query({
    //       deploymentKey: "test-key",
    //       appVersion: "1.0.0",
    //       clientUniqueId: "device1",
    //       isCompanion: "true",
    //     })
    //     .expect(200);
    // });

    // it("handles plain integer app version", async () => {
    //   await request(app)
    //     .get("/updateCheck")
    //     .query({
    //       deploymentKey: "test-key",
    //       appVersion: "1", // Should be converted to "1.0.0"
    //       clientUniqueId: "device1",
    //     })
    //     .expect(200);
    // });

    // it("handles missing patch version", async () => {
    //   await request(app)
    //     .get("/updateCheck")
    //     .query({
    //       deploymentKey: "test-key",
    //       appVersion: "1.0", // Should be converted to "1.0.0"
    //       clientUniqueId: "device1",
    //     })
    //     .expect(200);
    // });

    // it("handles version with pre-release tag", async () => {
    //   await request(app)
    //     .get("/updateCheck")
    //     .query({
    //       deploymentKey: "test-key",
    //       appVersion: "1.0-beta", // Should be converted to "1.0.0-beta"
    //       clientUniqueId: "device1",
    //     })
    //     .expect(200);
    // });

    // it("returns 500 if Redis operation fails", async () => {
    //   mockController.shouldRedisOperationsFail = true;
    //   await request(app)
    //     .get("/updateCheck")
    //     .query({
    //       deploymentKey: "test-key",
    //       appVersion: "1.0.0",
    //       clientUniqueId: "device1",
    //     })
    //     .expect(500);
    // });
  });

  describe("POST /reportStatus/download", () => {
    beforeEach(() => {
      mockController.shouldRedisOperationsFail = false;
    });

    it("returns sanitized error for malformed JSON", async () => {
      const response = await request(app).post("/reportStatus/download").send("invalid json{").expect(400);

      expect(response.body).toEqual({
        status: "error",
        message: "A download status report must contain a valid deploymentKey and package label.",
        code: 400,
      });
    });

    it("returns sanitized error for missing required fields", async () => {
      const response = await request(app).post("/reportStatus/download").send({}).expect(400);

      expect(response.body).toEqual({
        status: "error",
        message: "A download status report must contain a valid deploymentKey and package label.",
        code: 400,
      });
    });

    it("returns 200 for valid download status", async () => {
      const response = await request(app)
        .post("/reportStatus/download")
        .send({ deploymentKey: "test-key", label: "v1", client_unique_id: "test-1" })
        .expect(200);
    });

    it("return 500 if Redis operation fails ", async () => {
      mockController.shouldRedisOperationsFail = true;
      const response = await request(app)
        .post("/reportStatus/download")
        .send({ deploymentKey: "test-key", label: "v1", client_unique_id: "test-1" })
        .expect(500);
    });
  });

  describe("POST /reportStatus/deploy", () => {
    beforeEach(() => {
      mockController.shouldRedisOperationsFail = false;
    });

    it("returns 400 for missing required fields", async () => {
      const response = await request(app).post("/reportStatus/deploy").send({}).expect(400);

      expect(response.body).toEqual({
        status: "error",
        message: "A deploy status report must contain a valid appVersion and deploymentKey.",
        code: 400,
      });
    });

    it("returns 400 for missing status with label", async () => {
      const response = await request(app)
        .post("/reportStatus/deploy")
        .send({
          app_version: "101.10",
          deployment_key: "test-key",
          client_unique_id: "test-id",
          label: "v4",
        })
        .expect(400);

      expect(response.body).toEqual({
        status: "error",
        message: "A deploy status report for a labelled package must contain a valid status.",
        code: 400,
      });
    });

    it("returns 200 for valid deployment success status", async () => {
      await request(app)
        .post("/reportStatus/deploy")
        .send({
          app_version: "101.10",
          deployment_key: "test-key",
          client_unique_id: "test-id",
          label: "v4",
          status: "DeploymentSucceeded",
        })
        .expect(200);
    });

    it("returns 200 for valid deployment failure status", async () => {
      await request(app)
        .post("/reportStatus/deploy")
        .send({
          app_version: "101.10",
          deployment_key: "test-key",
          client_unique_id: "test-id",
          label: "v4",
          status: "DeploymentFailed",
        })
        .expect(200);
    });

    it("returns 500 if Redis operation fails", async () => {
      mockController.shouldRedisOperationsFail = true;
      await request(app)
        .post("/reportStatus/deploy")
        .send({
          app_version: "101.10",
          deployment_key: "test-key",
          client_unique_id: "test-id",
          label: "v4",
          status: "DeploymentSucceeded",
        })
        .expect(500);
    });

    it("returns 400 for invalid status value", async () => {
      const response = await request(app)
        .post("/reportStatus/deploy")
        .send({
          app_version: "101.10",
          deployment_key: "test-key",
          client_unique_id: "test-id",
          label: "v4",
          status: "InvalidStatus",
        })
        .expect(400);

      expect(response.body).toEqual({
        status: "error",
        message: "Invalid status: InvalidStatus",
        code: 400,
      });
    });

    it("handles deployment without label", async () => {
      await request(app)
        .post("/reportStatus/deploy")
        .send({
          app_version: "101.10",
          deployment_key: "test-key",
          client_unique_id: "test-id",
          status: "DeploymentSucceeded",
        })
        .expect(200);
    });

    it("handles previous deployment info", async () => {
      await request(app)
        .post("/reportStatus/deploy")
        .send({
          app_version: "101.10",
          deployment_key: "test-key",
          client_unique_id: "test-id",
          label: "v4",
          status: "DeploymentSucceeded",
          previous_deployment_key: "old-key",
          previous_label_or_app_version: "v3",
        })
        .expect(200);
    });

    it("returns 400 for oversized input values", async () => {
      const longString = "a".repeat(129); // Exceeds MAX_STRING_LENGTH
      await request(app)
        .post("/reportStatus/deploy")
        .send({
          app_version: longString,
          deployment_key: "test-key",
          client_unique_id: "test-id",
          label: "v4",
          status: "DeploymentSucceeded",
        })
        .expect(400);
    });
  });
});
