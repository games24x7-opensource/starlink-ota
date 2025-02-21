import express from "express";
import request from "supertest";
import { getAcquisitionRouter } from "../script/routes/acquisition";
import { RedisManager } from "../script/redis-manager";
import { AwsStorage } from "../script/storage/aws-storage";
import { resetMocks } from "./setup";

describe("Acquisition API", () => {
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
    it("returns 400 for missing required params", async () => {
      await request(app).get("/updateCheck").expect(400);
    });

    it("returns 400 for invalid deployment key", async () => {
      await request(app)
        .get("/updateCheck")
        .query({
          deploymentKey: "invalid-key",
          appVersion: "1.0.0",
          packageHash: "hash123",
          clientUniqueId: "device1",
        })
        .expect(400);
    });

    it("returns 400 when no updates available", async () => {
      await request(app)
        .get("/updateCheck")
        .query({
          deploymentKey: "test-key",
          appVersion: "1.0.0",
          packageHash: "hash123",
          clientUniqueId: "device1",
        })
        .expect(400);
    });
  });

  describe("Error handling", () => {
    it("returns sanitized error for malformed JSON", async () => {
      const response = await request(app).post("/reportStatus/download").send("invalid json{").expect(400);

      expect(response.body).toEqual({
        status: "error",
        message: "Bad Request",
        code: 400,
      });
    });

    it("returns sanitized error for missing required fields", async () => {
      const response = await request(app).post("/reportStatus/download").send({}).expect(400);

      expect(response.body).toEqual({
        status: "error",
        message: "Bad Request",
        code: 400,
      });
    });
  });

  //   describe("POST /reportStatus/download", () => {
  //     it("returns 400 for missing required fields", async () => {
  //       await request(app).post("/reportStatus/download").send({}).expect(400);
  //     });

  //     it("accepts valid download status", async () => {
  //       await request(app)
  //         .post("/reportStatus/download")
  //         .send({
  //           deploymentKey: "test-key",
  //           label: "v1",
  //         })
  //         .expect(200);

  //       const metrics = await redisManager.getMetricsWithDeploymentKey("test-key");
  //       expect(metrics[redis.Utilities.getLabelStatusField("v1", redis.DOWNLOADED)]).toBe(1);
  //     });
  //   });

  //   describe("POST /reportStatus/deploy", () => {
  //     it("returns 400 for missing required fields", async () => {
  //       await request(app).post("/reportStatus/deploy").send({}).expect(400);
  //     });

  //     it("accepts deployment status", async () => {
  //       await request(app)
  //         .post("/reportStatus/deploy")
  //         .send({
  //           deploymentKey: "test-key",
  //           appVersion: "1.0.0",
  //           clientUniqueId: "device1",
  //           label: "v1",
  //           status: redis.DEPLOYMENT_SUCCEEDED,
  //         })
  //         .expect(200);

  //       const metrics = await redisManager.getMetricsWithDeploymentKey("test-key");
  //       expect(metrics[redis.Utilities.getLabelStatusField("v1", redis.DEPLOYMENT_SUCCEEDED)]).toBe(1);
  //     });
  //   });
});
