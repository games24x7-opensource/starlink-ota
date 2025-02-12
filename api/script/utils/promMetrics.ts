import * as promClient from "prom-client";

export const flowMetricErrorCounter = new promClient.Counter({
  name: "flow_metric_error",
  labelNames: ["channelID", "method", "url"],
  help: "number of failed attempts at collecting flow metrics in middleware - collectFlowMetrics",
});

export const internalMethodtimings = new promClient.Histogram({
  name: "internal",
  labelNames: ["service", "method", "url"],
  help: "None",
});

export const internalStatusCounter = new promClient.Counter({
  name: "internal_status",
  labelNames: ["status", "service", "method", "url"],
  help: "None",
});
