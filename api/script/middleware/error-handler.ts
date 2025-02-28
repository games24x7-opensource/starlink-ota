import { Request, Response, NextFunction } from "express";
const Logger = require("../logger");

/**
 * Global error handler for the API.
 * @param err - The error object.
 * @param req - The request object.
 * @param res - The response object.
 * @param next - The next function.
 * @returns A JSON response with the error status, message, and code.
 */
export const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Log the error with full details for debugging
  Logger.error("globalErrorHandler: Request failed").setExpressReq(req).setError(err).log();

  // Handle our custom errors
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      status: "error",
      message: err.message || "Bad Request",
      code: err.statusCode,
    });
  }

  // Handle all other errors with a generic 500 response
  return res.status(500).json({
    status: "error",
    message: "Internal Server Error",
    code: 500,
  });
};
