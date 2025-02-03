import * as promClient from "prom-client";

export const flowMetricErrorCounter = new promClient.Counter({
  name: "flow_metric_error",
  labelNames: ["channelID", "method", "url"],
  help: "number of failed attempts at collecting flow metrics in middleware - collectFlowMetrics",
});
