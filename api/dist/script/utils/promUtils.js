"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectFlowMetrics = exports.getExpressApiPath = void 0;
const promMetrics_1 = require("./promMetrics");
const buildBasePath = (baseUrl) => (baseUrl ? `${baseUrl}` : "");
const buildRoutePath = (route) => ((route === null || route === void 0 ? void 0 : route.path) ? `${route.path}` : "");
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
                promCounter.labels(Object.assign({}, req.metricData)).inc();
            }
            catch (err) {
                promMetrics_1.flowMetricErrorCounter.inc({
                    method: req.method,
                    url: (0, exports.getExpressApiPath)(req),
                });
            }
        });
        next();
    };
};
exports.collectFlowMetrics = collectFlowMetrics;
//# sourceMappingURL=promUtils.js.map