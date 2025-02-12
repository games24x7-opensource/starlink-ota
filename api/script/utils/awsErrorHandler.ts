import { Request, Response, NextFunction } from "express";

export function awsErrorMiddleware(err: any, req: Request, res: Response, next: NextFunction): void {
  if (err && (err.code === "ExpiredToken" || (err.message && err.message.includes("The security token included in the request is expired")))) {
    res.status(401).json({ error: "token has expired. Please refresh credentials." });
    return;
  }
  next(err);
}