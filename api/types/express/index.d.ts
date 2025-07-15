import "express";

declare global {
  namespace Express {
    interface Request {
      metricData?: Record<string, any>;
    }
  }
}
