import express from "express";

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

/**
 * Single maximum length for all string parameters
 * Set to 128 chars which covers our longest expected input (UUIDs, hashes, etc.)
 * Simplifies maintenance and validation logic
 */
const MAX_STRING_LENGTH = Number(process.env.MAX_INPUT_STRING_LENGTH) || 128;

/**
 * Validates object keys and values against length and null checks
 */
function validateKeyValuePairs(obj: Record<string, any>): boolean {
  for (const [key, value] of Object.entries(obj)) {
    if (!key || key.length > MAX_STRING_LENGTH || (value && typeof value === "string" && value.length > MAX_STRING_LENGTH)) {
      return false;
    }
  }
  return true;
}

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
export function acquisitionInputSanitizer(): express.RequestHandler {
  return (req: express.Request, res: express.Response, next: Function) => {
    try {
      // Validate query parameters if present
      if (req.query && typeof req.query === "object" && Object.keys(req.query).length > 0) {
        if (!validateKeyValuePairs(req.query)) {
          return sendErrorResponse(res, "Invalid request");
        }
      }

      // Validate body if present
      if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
        if (!validateKeyValuePairs(req.body)) {
          return sendErrorResponse(res, "Invalid request");
        }
      }

      next();
    } catch (error) {
      return sendErrorResponse(res, "Invalid request");
    }
  };
}
