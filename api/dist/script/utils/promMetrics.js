"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalStatusCounter = exports.internalMethodtimings = exports.flowMetricErrorCounter = void 0;
const prom_client_1 = __importDefault(require("prom-client"));
exports.flowMetricErrorCounter = new prom_client_1.default.Counter({
    name: "flow_metric_error",
    labelNames: ["channelID", "method", "url"],
    help: "number of failed attempts at collecting flow metrics in middleware - collectFlowMetrics",
});
exports.internalMethodtimings = new prom_client_1.default.Histogram({
    name: "internal",
    labelNames: ["service", "method", "url"],
    help: "None",
});
exports.internalStatusCounter = new prom_client_1.default.Counter({
    name: "internal_status",
    labelNames: ["status", "service", "method", "url"],
    help: "None",
});
//# sourceMappingURL=promMetrics.js.map