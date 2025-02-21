import express from "express";

/**
 * Helper function to send consistent error responses
 */
function sendErrorResponse(res: express.Response, message: string, code = 400) {
  return res.status(code).json({
    status: "error",
    message,
    code,
  });
}

export function InputSanitizer(req: express.Request, res: express.Response, next: (err?: any) => void): any {
  if (Object.keys(req.query).length > 0) {
    req.query.deploymentKey = trimInvalidCharacters((req.query.deploymentKey || req.query.deployment_key) as string);
  }

  next();
}

function trimInvalidCharacters(text: string): string {
  return text && text.trim();
}

/**
 * Single maximum length for all string parameters
 * Set to 128 chars which covers our longest expected input (UUIDs, hashes, etc.)
 * Simplifies maintenance and validation logic
 */
const MAX_STRING_LENGTH = Number(process.env.MAX_INPUT_STRING_LENGTH) || 128;
/**
 *
 * @lokesh-inumpudi
 * Middleware to protect acquisition endpoints from oversized inputs
 * Simple, fast validation using a single length limit
 *
 * Performance optimized:
 * - Single length check
 * - No parameter-specific rules
 * - No object lookups
 * - Minimal error handling
 */
export function acquisitionInputSanitizer(): express.RequestHandler {
  return (req: express.Request, res: express.Response, next: Function) => {
    try {
      // Validate query parameters (GET requests)
      if (req.method === "GET") {
        if (req.query && Object.keys(req.query).length > 0) {
          for (const key in req.query) {
            const value = req.query[key];
            if (!value || (typeof value === "string" && value.length > MAX_STRING_LENGTH)) {
              return sendErrorResponse(res, "invalid query parameters");
            }
          }
        } else {
          // facilitate normal GET requests without query parameters
          return next();
        }
      }

      // Validate body parameters (POST/PUT requests)
      if (["POST", "PUT"].includes(req.method)) {
        if (!req.body || Object.keys(req.body).length === 0) {
          return sendErrorResponse(res, "Invalid request body");
        }

        if (typeof req.body !== "object" || Array.isArray(req.body)) {
          return sendErrorResponse(res, "Invalid request body");
        }

        for (const key in req.body) {
          const value = req.body[key];
          if (!value || (typeof value === "string" && value.length > MAX_STRING_LENGTH)) {
            return sendErrorResponse(res, "Invalid request body");
          }
        }
      }

      next();
    } catch {
      return sendErrorResponse(res, "Invalid request format");
    }
  };
}
