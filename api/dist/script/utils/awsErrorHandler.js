"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.awsErrorMiddleware = awsErrorMiddleware;
function awsErrorMiddleware(err, req, res, next) {
    if (err && (err.code === "ExpiredToken" || (err.message && err.message.includes("The security token included in the request is expired")))) {
        res.status(401).json({ error: "token has expired. Please refresh credentials." });
        return;
    }
    next(err);
}
//# sourceMappingURL=awsErrorHandler.js.map