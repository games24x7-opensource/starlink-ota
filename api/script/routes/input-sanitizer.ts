import express from "express";

export function InputSanitizer(req: express.Request, res: express.Response, next: (err?: any) => void): any {
  if (req.query) {
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
      if (req.query) {
        for (const key in req.query) {
          const value = req.query[key];
          if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
            return res.status(400).json({ error: "INVALID_PARAMS" });
          }
        }
      }

      // Validate body parameters (POST requests)
      if (req.body && typeof req.body === "object") {
        for (const key in req.body) {
          const value = req.body[key];
          if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
            return res.status(400).json({ error: "INVALID_PARAM_LENGTH" });
          }
        }
      }

      next();
    } catch {
      // Continue on unexpected errors to maintain service availability
      next();
    }
  };
}
