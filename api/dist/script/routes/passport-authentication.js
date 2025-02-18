"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PassportAuthentication = void 0;
const cookie_session_1 = __importDefault(require("cookie-session"));
const express_1 = require("express");
const passport_1 = __importDefault(require("passport"));
const passportActiveDirectory = require("passport-azure-ad");
const passport_http_bearer_1 = __importDefault(require("passport-http-bearer"));
const passport_github2_1 = __importDefault(require("passport-github2"));
const passport_windowslive_1 = __importDefault(require("passport-windowslive"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const restErrorUtils = __importStar(require("../utils/rest-error-handling"));
const restHeaders = __importStar(require("../utils/rest-headers"));
const security = __importStar(require("../utils/security"));
const storage = __importStar(require("../storage/storage"));
const validationUtils = __importStar(require("../utils/validation"));
const DEFAULT_SESSION_EXPIRY = 1000 * 60 * 60 * 24 * 60; // 60 days
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
});
class PassportAuthentication {
    constructor(config) {
        this._serverUrl = process.env["SERVER_URL"];
        // This session is neither encrypted nor signed beyond what is provided by SSL
        // By default, the 'secure' flag will be set if the node process is using SSL
        this._cookieSessionMiddleware = (0, cookie_session_1.default)({
            httpOnly: true,
            ttl: 3600000, // One hour in milliseconds
            name: "oauth.session",
            path: "/",
            signed: false,
            overwrite: true,
        });
        this._storageInstance = config.storage;
        passport_1.default.use(new passport_http_bearer_1.default.Strategy((accessKey, done) => {
            if (!validationUtils.isValidKeyField(accessKey)) {
                done(/*err*/ null, /*user*/ false);
                return;
            }
            this._storageInstance
                .getAccountIdFromAccessKey(accessKey)
                .then((accountId) => {
                done(/*err*/ null, { id: accountId });
            })
                .catch((error) => PassportAuthentication.storageErrorHandler(error, done))
                .done();
        }));
    }
    authenticate(req, res, next) {
        passport_1.default.authenticate("bearer", { session: false }, (err, user) => {
            if (err || !user) {
                if (!err || err.code === storage.ErrorCode.NotFound) {
                    res
                        .status(401)
                        .send(`The session or access key being used is invalid, please run "code-push-standalone login" again. If you are on an older version of the CLI, you may need to run "code-push-standalone logout" first to clear the session cache.`);
                }
                else if (err.code === storage.ErrorCode.Expired) {
                    res
                        .status(401)
                        .send(`The session or access key being used has expired, please run "code-push-standalone login" again. If you are on an older version of the CLI, you may need to run "code-push-standalone logout" first to clear the session cache.`);
                }
                else {
                    res.sendStatus(500);
                    next(err);
                }
            }
            else {
                req.user = user;
                next();
            }
        })(req, res, next);
    }
    getLegacyRouter() {
        const router = (0, express_1.Router)();
        const browserMessage = "Due to significant service improvements, your current CLI version is no longer supported." +
            "<br/>Please upgrade to the latest version by running 'npm install -g code-push-cli@latest'." +
            "<br/>Note that your end users will not be affected.";
        const cliMessage = "Due to significant service improvements, your current CLI version is no longer supported." +
            "\nPlease upgrade to the latest version by running 'npm install -g code-push-cli@latest'." +
            "\nNote that your end users will not be affected.";
        // In legacy CLI's, all commands begin by passing through a /auth endpoint
        router.all("/auth/login", (req, res, next) => {
            restErrorUtils.sendResourceGonePage(res, browserMessage);
        });
        router.all("/auth/register", (req, res, next) => {
            restErrorUtils.sendResourceGonePage(res, browserMessage);
        });
        router.use("/auth", (req, res, next) => {
            restErrorUtils.sendResourceGoneError(res, cliMessage);
        });
        return router;
    }
    getRouter() {
        const router = (0, express_1.Router)();
        router.use(passport_1.default.initialize());
        router.get("/authenticated", limiter, this.authenticate, (req, res) => {
            res.send({ authenticated: true });
        });
        // See https://developer.github.com/v3/oauth/ for more information.
        // GITHUB_CLIENT_ID:     The client ID you received from GitHub when registering a developer app.
        // GITHUB_CLIENT_SECRET: The client secret you received from GitHub when registering a developer app.
        const gitHubClientId = process.env["GITHUB_CLIENT_ID"];
        const gitHubClientSecret = process.env["GITHUB_CLIENT_SECRET"];
        const isGitHubAuthenticationEnabled = !!this._serverUrl && !!gitHubClientId && !!gitHubClientSecret;
        if (isGitHubAuthenticationEnabled) {
            this.setupGitHubRoutes(router, gitHubClientId, gitHubClientSecret);
        }
        // See https://msdn.microsoft.com/en-us/library/hh243649.aspx for more information.
        // MICROSOFT_CLIENT_ID:     The client ID you received from Microsoft when registering an app.
        // MICROSOFT_CLIENT_SECRET: The client secret you received from Microsoft when registering an app.
        const microsoftClientId = process.env["MICROSOFT_CLIENT_ID"];
        const microsoftClientSecret = process.env["MICROSOFT_CLIENT_SECRET"];
        const isMicrosoftAuthenticationEnabled = !!this._serverUrl && !!microsoftClientId && !!microsoftClientSecret;
        if (isMicrosoftAuthenticationEnabled) {
            this.setupMicrosoftRoutes(router, microsoftClientId, microsoftClientSecret);
            this.setupAzureAdRoutes(router, microsoftClientId, microsoftClientSecret);
        }
        router.get("/auth/login", this._cookieSessionMiddleware, (req, res) => {
            req.session["hostname"] = req.query.hostname;
            res.render("authenticate", { action: "login", isGitHubAuthenticationEnabled, isMicrosoftAuthenticationEnabled });
        });
        router.get("/auth/link", this._cookieSessionMiddleware, (req, res) => {
            req.session["authorization"] = req.query.access_token;
            res.render("authenticate", { action: "link", isGitHubAuthenticationEnabled, isMicrosoftAuthenticationEnabled });
        });
        router.get("/auth/register", this._cookieSessionMiddleware, (req, res) => {
            req.session["hostname"] = req.query.hostname;
            res.render("authenticate", { action: "register", isGitHubAuthenticationEnabled, isMicrosoftAuthenticationEnabled });
        });
        return router;
    }
    static getEmailAddress(user) {
        var _a, _b;
        const emailAccounts = user.emails;
        if (!emailAccounts || emailAccounts.length === 0) {
            return ((_a = user === null || user === void 0 ? void 0 : user._json) === null || _a === void 0 ? void 0 : _a.email) || ((_b = user === null || user === void 0 ? void 0 : user._json) === null || _b === void 0 ? void 0 : _b.preferred_username) || user.oid; // This is the format used by passport-azure-ad
        }
        let emailAddress;
        for (let i = 0; i < emailAccounts.length; ++i) {
            const emailAccount = emailAccounts[i];
            if (emailAccount.primary) {
                return emailAccount.value;
            }
            emailAddress = emailAccount.value;
        }
        return emailAddress;
    }
    static isAccountRegistrationEnabled() {
        const value = process.env["ENABLE_ACCOUNT_REGISTRATION"] || "true";
        return value.toLowerCase() === "true";
    }
    static storageErrorHandler(error, done) {
        if (error.code === storage.ErrorCode.NotFound) {
            done(/*error=*/ null, /*user=*/ false);
        }
        else {
            done(error, /*user=*/ false);
        }
    }
    static getProviderId(account, provider) {
        switch (provider) {
            case PassportAuthentication.AZURE_AD_PROVIDER_NAME:
                return account.azureAdId;
            case PassportAuthentication.GITHUB_PROVIDER_NAME:
                return account.gitHubId;
            case PassportAuthentication.MICROSOFT_PROVIDER_NAME:
                return account.microsoftId;
            default:
                throw new Error("Unrecognized provider");
        }
    }
    static setProviderId(account, provider, id) {
        switch (provider) {
            case PassportAuthentication.AZURE_AD_PROVIDER_NAME:
                account.azureAdId = id;
                return;
            case PassportAuthentication.GITHUB_PROVIDER_NAME:
                account.gitHubId = id;
                return;
            case PassportAuthentication.MICROSOFT_PROVIDER_NAME:
                account.microsoftId = id;
                return;
            default:
                throw new Error("Unrecognized provider");
        }
    }
    setupCommonRoutes(router, providerName, strategyName) {
        router.get("/auth/login/" + providerName, limiter, this._cookieSessionMiddleware, (req, res, next) => {
            req.session["action"] = "login";
            passport_1.default.authenticate(strategyName, { session: false })(req, res, next);
        });
        router.get("/auth/register/" + providerName, limiter, this._cookieSessionMiddleware, (req, res, next) => {
            if (!PassportAuthentication.isAccountRegistrationEnabled()) {
                restErrorUtils.sendForbiddenError(res);
                return;
            }
            req.session["action"] = "register";
            passport_1.default.authenticate(strategyName, { session: false })(req, res, next);
        });
        router.get("/auth/link/" + providerName, limiter, this._cookieSessionMiddleware, (req, res, next) => {
            req.session["action"] = "link";
            passport_1.default.authenticate(strategyName, { session: false })(req, res, next);
        });
        router.get("/auth/callback/" + providerName, limiter, this._cookieSessionMiddleware, passport_1.default.authenticate(strategyName, { failureRedirect: "/auth/login/" + providerName, session: false }), (req, res, next) => {
            const action = req.session["action"];
            const hostname = req.session["hostname"];
            const user = req.user;
            if (action === "register" && !PassportAuthentication.isAccountRegistrationEnabled()) {
                restErrorUtils.sendForbiddenError(res);
                return;
            }
            const emailAddress = PassportAuthentication.getEmailAddress(user);
            if (!emailAddress && providerName === PassportAuthentication.MICROSOFT_PROVIDER_NAME) {
                const message = "You've successfully signed in your Microsoft account, but we couldn't get an email address from it." +
                    "<br/>Please fill the basic information (i.e. First/Last name, Email address) for your Microsoft account in case of absence, then try to run 'code-push-standalone login' again.";
                restErrorUtils.sendForbiddenPage(res, message);
                return;
            }
            else if (!emailAddress) {
                restErrorUtils.sendUnknownError(res, new Error(`Couldn't get an email address from the ${providerName} OAuth provider for user ${JSON.stringify(user)}`), next);
                return;
            }
            const issueAccessKey = (accountId) => {
                const now = new Date().getTime();
                const friendlyName = `Login-${now}`;
                const accessKey = {
                    name: security.generateSecureKey(accountId),
                    createdTime: now,
                    createdBy: hostname || restHeaders.getIpAddress(req),
                    description: friendlyName,
                    expires: now + DEFAULT_SESSION_EXPIRY,
                    friendlyName: friendlyName,
                    isSession: true,
                };
                return this._storageInstance.addAccessKey(accountId, accessKey).then((accessKeyId) => {
                    const key = accessKey.name;
                    req.session["accessKey"] = key;
                    req.session["isNewAccount"] = action === "register";
                    res.redirect("/accesskey");
                });
            };
            this._storageInstance
                .getAccountByEmail(emailAddress)
                .then((account) => {
                const existingProviderId = PassportAuthentication.getProviderId(account, providerName);
                const isProviderValid = existingProviderId === user.id;
                switch (action) {
                    case "register":
                        const message = isProviderValid
                            ? "You are already registered with the service using this authentication provider.<br/>Please cancel the registration process (Ctrl-C) on the CLI and login with your account."
                            : "You are already registered with the service using a different authentication provider." +
                                "<br/>Please cancel the registration process (Ctrl-C) on the CLI and login with your registered account." +
                                "<br/>Once logged in, you can optionally link this provider to your account.";
                        restErrorUtils.sendAlreadyExistsPage(res, message);
                        return;
                    case "link":
                        if (existingProviderId) {
                            restErrorUtils.sendAlreadyExistsPage(res, "You are already registered with the service using this provider.");
                            return;
                        }
                        PassportAuthentication.setProviderId(account, providerName, user.id);
                        return this._storageInstance.updateAccount(account.email, account).then(() => {
                            res.render("message", {
                                message: "You have successfully linked your account!<br/>You will now be able to use this provider to authenticate in the future.<br/>Please return to the CLI to continue.",
                            });
                        });
                    case "login":
                        if (!isProviderValid) {
                            restErrorUtils.sendForbiddenPage(res, "You are not registered with the service using this provider account.");
                            return;
                        }
                        return issueAccessKey(account.id);
                    default:
                        restErrorUtils.sendUnknownError(res, new Error(`Unrecognized action (${action})`), next);
                        return;
                }
            }, (error) => {
                if (error.code !== storage.ErrorCode.NotFound)
                    throw error;
                switch (action) {
                    case "login":
                        const message = PassportAuthentication.isAccountRegistrationEnabled()
                            ? "Account not found.<br/>Have you registered with the CLI?<br/>If you are registered but your email address has changed, please contact us."
                            : "Account not found.<br/>Please <a href='http://microsoft.github.io/code-push/'>sign up for the beta</a>, and we will contact you when your account has been created!</a>";
                        restErrorUtils.sendForbiddenPage(res, message);
                        return;
                    case "link":
                        restErrorUtils.sendForbiddenPage(res, "We weren't able to link your account, because the primary email address registered with your provider does not match the one on your CodePush account." +
                            "<br/>Please use a matching email address, or contact us if you'd like to change the email address on your CodePush account.");
                        return;
                    case "register":
                        const newUser = {
                            createdTime: new Date().getTime(),
                            email: emailAddress,
                            name: user.displayName,
                        };
                        PassportAuthentication.setProviderId(newUser, providerName, user.id);
                        return this._storageInstance
                            .addAccount(newUser)
                            .then((accountId) => issueAccessKey(accountId));
                    default:
                        restErrorUtils.sendUnknownError(res, new Error(`Unrecognized action (${action})`), next);
                        return;
                }
            })
                .catch((error) => {
                error.message = `Unexpected failure with action ${action}, provider ${providerName}, email ${emailAddress}, and message: ${error.message}`;
                restErrorUtils.sendUnknownError(res, error, next);
            })
                .done();
        });
        router.get("/accesskey", limiter, this._cookieSessionMiddleware, (req, res) => {
            const accessKey = req.session["accessKey"];
            const isNewAccount = req.session["isNewAccount"];
            req.session = null;
            res.render("accesskey", { accessKey: accessKey, isNewAccount: isNewAccount });
        });
    }
    getCallbackUrl(providerName) {
        return `${this._serverUrl}/auth/callback/${providerName}`;
    }
    setupGitHubRoutes(router, gitHubClientId, gitHubClientSecret) {
        const providerName = PassportAuthentication.GITHUB_PROVIDER_NAME;
        const strategyName = "github";
        const options = {
            clientID: gitHubClientId,
            clientSecret: gitHubClientSecret,
            callbackURL: this.getCallbackUrl(providerName),
            scope: ["user:email"],
            state: true,
        };
        passport_1.default.use(new passport_github2_1.default.Strategy(options, (accessToken, refreshToken, profile, done) => {
            done(/*err*/ null, profile);
        }));
        this.setupCommonRoutes(router, providerName, strategyName);
    }
    setupMicrosoftRoutes(router, microsoftClientId, microsoftClientSecret) {
        const providerName = PassportAuthentication.MICROSOFT_PROVIDER_NAME;
        const strategyName = "windowslive";
        const options = {
            clientID: microsoftClientId,
            clientSecret: microsoftClientSecret,
            callbackURL: this.getCallbackUrl(providerName),
            scope: ["wl.signin", "wl.emails"],
            state: true,
        };
        passport_1.default.use(new passport_windowslive_1.default.Strategy(options, (accessToken, refreshToken, profile, done) => {
            done(/*err*/ null, profile);
        }));
        this.setupCommonRoutes(router, providerName, strategyName);
    }
    setupAzureAdRoutes(router, microsoftClientId, microsoftClientSecret) {
        const providerName = PassportAuthentication.AZURE_AD_PROVIDER_NAME;
        const strategyName = "azuread-openidconnect";
        const options = {
            redirectUrl: this.getCallbackUrl(providerName),
            clientID: microsoftClientId,
            clientSecret: microsoftClientSecret,
            identityMetadata: `https://login.microsoftonline.com/${process.env["MICROSOFT_TENANT_ID"] || "common"}/v2.0/.well-known/openid-configuration`,
            responseMode: "query",
            responseType: "code",
            scope: ["email", "profile"],
            skipUserProfile: true, // Should be set to true for Azure AD
            validateIssuer: false, // We allow AD authentication across multiple tenants
            allowHttpForRedirectUrl: true,
        };
        passport_1.default.use(new passportActiveDirectory.OIDCStrategy(options, (iss, sub, profile, accessToken, refreshToken, done) => {
            done(/*err*/ null, profile);
        }));
        this.setupCommonRoutes(router, providerName, strategyName);
    }
}
exports.PassportAuthentication = PassportAuthentication;
PassportAuthentication.AZURE_AD_PROVIDER_NAME = "azure-ad";
PassportAuthentication.GITHUB_PROVIDER_NAME = "github";
PassportAuthentication.MICROSOFT_PROVIDER_NAME = "microsoft";
//# sourceMappingURL=passport-authentication.js.map