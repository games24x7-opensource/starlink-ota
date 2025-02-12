import { NextFunction, Request, Response } from "express";
import { Counter } from "prom-client";
import { flowMetricErrorCounter } from "./promMetrics";

const buildBasePath = (baseUrl?: string): string => (baseUrl ? `${baseUrl}` : "");
const buildRoutePath = (route?: { path?: string }): string => (route?.path ? `${route.path}` : "");

export const getExpressApiPath = (req: any): string => {
  const basePath = buildBasePath(req.baseUrl);
  const routePath = buildRoutePath(req.route);
  return basePath + routePath;
};

export const collectFlowMetrics = (promCounter: Counter) => {
  return (req: Request, res: Response, next: NextFunction) => {
    //@ts-ignore
    if (!req.metricData) {
      //@ts-ignore
      req.metricData = {};
    }

    res.on("finish", () => {
      try {
        //@ts-ignore
        promCounter.labels({ ...req.metricData }).inc();
      } catch (err) {
        flowMetricErrorCounter.inc({
          method: req.method,
          url: getExpressApiPath(req),
        });
      }
    });
    next();
  };
};
