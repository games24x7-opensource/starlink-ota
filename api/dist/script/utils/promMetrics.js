"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalStatusCounter = exports.internalMethodtimings = exports.flowMetricErrorCounter = void 0;
const promClient = require("prom-client");
exports.flowMetricErrorCounter = new promClient.Counter({
    name: "flow_metric_error",
    labelNames: ["channelID", "method", "url"],
    help: "number of failed attempts at collecting flow metrics in middleware - collectFlowMetrics",
});
exports.internalMethodtimings = new promClient.Histogram({
    name: "internal",
    labelNames: ["service", "method", "url"],
    help: "None",
});
exports.internalStatusCounter = new promClient.Counter({
    name: "internal_status",
    labelNames: ["status", "service", "method", "url"],
    help: "None",
});
//# sourceMappingURL=promMetrics.js.map