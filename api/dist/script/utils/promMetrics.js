"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flowMetricErrorCounter = void 0;
const promClient = require("prom-client");
exports.flowMetricErrorCounter = new promClient.Counter({
    name: "flow_metric_error",
    labelNames: ["channelID", "method", "url"],
    help: "number of failed attempts at collecting flow metrics in middleware - collectFlowMetrics",
});
//# sourceMappingURL=promMetrics.js.map