"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectFlowMetrics = exports.getExpressApiPath = void 0;
const promMetrics_1 = __importDefault(require("./promMetrics"));
const logger_1 = __importDefault(require("../logger"));
const buildBasePath = (baseUrl) => (baseUrl ? `${baseUrl}` : "");
const buildRoutePath = (route) => (route?.path ? `${route.path}` : "");
const getExpressApiPath = (req) => {
    const basePath = buildBasePath(req.baseUrl);
    const routePath = buildRoutePath(req.route);
    return basePath + routePath;
};
exports.getExpressApiPath = getExpressApiPath;
const collectFlowMetrics = (promCounter) => {
    return (req, res, next) => {
        //@ts-ignore
        if (!req.metricData) {
            //@ts-ignore
            req.metricData = {};
        }
        res.on("finish", () => {
            try {
                //@ts-ignore
                promCounter.labels({ ...req.metricData }).inc();
            }
            catch (err) {
                promMetrics_1.default.flowMetricErrorCounter.inc({
                    method: req.method,
                    url: (0, exports.getExpressApiPath)(req),
                });
                logger_1.default.error(req, res, `collectFlowMetrics error`, { error: err });
            }
        });
        next();
    };
};
exports.collectFlowMetrics = collectFlowMetrics;
//# sourceMappingURL=promUtils.js.map