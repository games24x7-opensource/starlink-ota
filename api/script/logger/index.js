const bunyan = require('bunyan');
const _ = require('lodash');
const path = require('path');

/**
 * Why stack-trace npm module?
 * 1. To get callsite
 *     This module a famous on for getting callsite
 * 2. To parse error stack
 *     This module does a pretty good job at parsing error stacks.
 */
import {get,parse} from 'stack-trace';

/**
 * Why custom serializer?
 * - Wanted to make errors more beautiful in logs.
 * @type {{res: *}}
 */



const serializers = {
  res: bunyan.stdSerializers.res,
};


const getLogStreams = () => {
  const streams = [];
  const {NODE_ENV, ENV} = process.env;
  if ('development' === NODE_ENV || 'docker' === ENV || /k8s/gi.test(ENV)) {
    streams.push(
      {stream: process.stdout, level: 'info'},
      {stream: process.stderr, level: 'error'},
    );
  } else if (process.env.APP_LOG_PATH) {
    streams.push({
      level: 'info',
      path: path.join(process.env.APP_LOG_PATH, `info_${process.pid}.log`),
    });
    streams.push({
      level: 'error',
      path: path.join(process.env.APP_LOG_PATH, `error_${process.pid}.log`),
    });
  }
  return streams;
};

// Why creating two logger?
// - The idea here is to have a separation.
// - What ever is info should go to stdout
// - Errors should go to stderr
// - The behaviour of bunyan is that if we do a log.error, then it will be logged twice.
//    - Once in stdout since, info will also recieve it,
//    - The second time in stderr since we asked for it.
const infoLogger = bunyan.createLogger({
  name: 'starlink-ota',
  serializers: serializers,
  streams: getLogStreams(),
  level: bunyan.INFO,
});

const errorLogger = bunyan.createLogger({
  name: 'starlink-ota',
  serializers: serializers,
  streams: getLogStreams(),
  level: bunyan.ERROR,
});

const API_VERSION_HEADER = "x-codepush-api-version";
const CLI_VERSION_HEADER = "x-codepush-cli-version";
const PLUGIN_NAME_HEADER = "x-codepush-plugin-name";
const PLUGIN_VERSION_HEADER = "x-codepush-plugin-version";
const SDK_VERSION_HEADER = "x-codepush-sdk-version";
class Logger {
  constructor(message) {
    this._message = message;
  }

  setLogLevel(level) {
    this._level = level;
    return this;
  }

  setMessage(message) {
    this._message = message;
    return this;
  }

  setSessionId(sessionId) {
    this._sessionId = sessionId;
    return this;
  }

  setUserId(userId) {
    this._userId = Number(userId);
    return this;
  }

  setError(error) {
    if (!error) {
      return this;
    }

    this._error = errorSerializer(error);
    this.setLogLevel(Logger.level.ERROR);
    return this;
  }

  setData(data) {
    this._data = data;
    return this;
  }

  setURL(url) {
    this._url = url;
    return this;
  }

  setReqId(reqId) {
    this._reqId = reqId;
    return this;
  }

  setAmznTraceId(traceId) {
    this._traceId = traceId;
    return this;
  }

  setUpstreamRequestParams(requestParams) {
    this._upstreamRequestParams = requestParams;
    return this;
  }

  setUpstreamResponse(response) {
    if (response && response.body) {
      this._upstreamResponse = response.body;
    }

    return this;
  }

  setTimeTakenMS(timeTaken) {
    this._timeTakenMS = timeTaken;
    return this;
  }

  setSessionChannelId(id) {
    this._sessionChannelId = Number(id);
    return this;
  }

  setReqChannelId(id) {
    this._reqChannelId = Number(id);
    return this;
  }

  setResponseStatus(status) {
    this._responseStatus = status;
    return this;
  }

  _extractSessionDetails(session) {
    if (!session) {
      return;
    }

    if (session.ssid) {
      this.setSessionId(session.ssid);
    }

    if (session.user_id) {
      this.setUserId(session.user_id);
    }

    if (session.channelID) {
      this.setSessionChannelId(session.channelID);
    }
  }

  setExpressReq(req, shouldAddReqOptions) {
    if (!req) {
      return this;
    }

    this._req = reqSerializer(req, shouldAddReqOptions);

    if (req.originalUrl) {
      this.setURL(req.originalUrl);
    }

    if (req.reqId) {
      this.setReqId(req.reqId);
    }

    // https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-request-tracing.html
    if (req.headers && req.headers['x-amzn-trace-id']) {
      this.setAmznTraceId(req.headers['x-amzn-trace-id']);
    }

    if (req.headers) {
      this._extractCodePushHeaders(req.headers);
    }

    if (req.session) {
      this._extractSessionDetails(req.session);
    }

    if (req.channelID) {
      this.setReqChannelId(req.channelID);
    }

    if (typeof req.isMobile !== 'undefined') {
      this._isMobile = req.isMobile;
    }

    return this;
  }

  _extractCodePushHeaders(headers) {
    if (!headers) {
      return;
    }

    if (headers[API_VERSION_HEADER]) {
      this._apiVersion = headers[API_VERSION_HEADER];
    }

    if (headers[CLI_VERSION_HEADER]) {
      this._cliVersion = headers[CLI_VERSION_HEADER];
    }

    if (headers[PLUGIN_NAME_HEADER]) {
      this._pluginName = headers[PLUGIN_NAME_HEADER];
    }

    if (headers[PLUGIN_VERSION_HEADER]) {
      this._pluginVersion = headers[PLUGIN_VERSION_HEADER];
    }

    if (headers[SDK_VERSION_HEADER]) {
      this._sdkVersion = headers[SDK_VERSION_HEADER];
    }

  }

  log() {
    let level = this._level;

    if (!level) {
      level = this._error ? Logger.level.ERROR : Logger.level.INFO;

      this._level = level;
    }

    let message = this._message;

    if (this._error && this._error.message && this._upstreamRequestParams) {
      message += ' Error: ' + this._error.message;
    }

    if (level === Logger.level.INFO) {
      infoLogger.info(this._prepareData(), message);
      return;
    }

    errorLogger.error(this._prepareData(), message);
  }

  _prepareData() {
    const time = new Date();
    const data = {
      time: time.toString(),
      epoch: time.getTime(),
      userId: this._userId,
      sessionId: this._sessionId,
      channelId: this._reqChannelId,
      isMobile: this._isMobile,
      reqId: this._reqId,
      awsTraceId: this._traceId,
      //-------------------------//
      url: this._url,
      timeTakenMS: this._timeTakenMS,
      responseStatus: this._responseStatus,
      //-------------------------//
      apiVersion: this._apiVersion,
      cliVersion: this._cliVersion,
      pluginName: this._pluginName,
      pluginVersion: this._pluginVersion,
      sdkVersion: this._sdkVersion,
      //-------------------------//
      req: this._req,
      err: this._error,
      data: this._data,
    };

    if (
      this._sessionChannelId &&
      this._sessionChannelId !== this._reqChannelId
    ) {
      data.sessionChannelId = this._sessionChannelId;
    }

    if (this._upstreamRequestParams) {
      data.upstreamRest = {
        request: this._upstreamRequestParams,
        response: this._upstreamResponse,
      };
    }

    if (this._error || this._level === Logger.level.ERROR) {
      data.src = getCallSite();
    }

    return data;
  }

  static info(message) {
    const logger = new Logger(message);
    logger.setLogLevel(Logger.level.INFO);
    return logger;
  }

  static error(message) {
    const logger = new Logger(message);
    logger.setLogLevel(Logger.level.ERROR);
    return logger;
  }

  static instance(message) {
    const logger = new Logger(message);
    return logger;
  }
}

Logger.level = {
  INFO: 'info',
  ERROR: 'error',
};

Logger.status = {
  SUCCESS: 'success',
  FAILURE: 'failure',
};

/**
 * Why getting callsite?
 * - Sometimes we need the place from where we invoked this log module.
 * - This will help us in debugging
 *
 * Possible solutions?
 * 1. npm stack-trace module
 * 2. bunyan's getCaller3Info function
 * PS: The performance of both the solutions are same.
 *     Memory wise stack-trace takes little less memory.
 *
 * Why use stack-trace module?
 * - It give an error stack parser as well.
 * - This is a popular module to get callsite (1.6 M downloads per week)
 *
 * Performance hit?
 * - Logging with stack is 5-6 times slower
 * - This is because v8's stacktrace API is slow
 *      - log.info with    src:  0.02121ms per iteration
 *      - log.info without src:  0.00382ms per iteration
 *
 * Still why keep it?
 * - In case of error, we should always get the source of log.
 * - So, for high debug-ability we are taking this performance hit.
 *
 */

function getCallSite() {
  const stack = get();
  if (!stack || stack.length < 4) {
    return;
  }

  const caller = stack[3];

  return {
    function: caller.getFunctionName(),
    file: caller.getFileName(),
    line: caller.getLineNumber(),
    column: caller.getColumnNumber(),
  };
}

/**
 * CAUTION: THIS IS NOT USED.
 *
 * Taken from Bunyan source code:
 * https://github.com/trentm/node-bunyan/blob/master/lib/bunyan.js
 * Refer: function name getCaller3Info
 *
 * Why keeping this code here?
 * - Bunyan has given a way to get stack, by specifying src = true
 *   But, since we are using a wrapper, it will always log about the wrapper file and it's log function
 * - To solve above problem, we have taken this function one level up and calling it manually.
 */
function getCaller3Info() {
  if (this === undefined) {
    // Cannot access caller info in 'strict' mode.
    return;
  }
  const obj = {};
  const saveLimit = Error.stackTraceLimit;
  const savePrepare = Error.prepareStackTrace;
  Error.stackTraceLimit = 3;

  Error.prepareStackTrace = function (_, stack) {
    const caller = stack[2];

    obj.file = caller.getFileName();
    obj.line = caller.getLineNumber();
    const func = caller.getFunctionName();
    if (func) obj.func = func;
  };
  Error.captureStackTrace(this, getCaller3Info);
  this.stack;

  Error.stackTraceLimit = saveLimit;
  Error.prepareStackTrace = savePrepare;
  return obj;
}

/**
 * Bunyan style error serializer.
 * Why write our own stack parser?
 * - So, that we can show a readable stack.
 * @param err
 * @returns {*}
 */
function errorSerializer(err) {
  if (!err) return err;
  
  try {
    return {
      message: err.message,
      rawUpstreamResponse: err.rawResponse,
      status: err.status,
      upstreamStatusCode: err.statusCode,
      code: err.code,
      signal: err.signal,
      name: err.name,
      body: err.body,
      stack: err.stack ? parseErrorStack(err) : undefined
    };
  } catch (e) {
    // Fallback if serialization fails
    return {
      message: String(err),
      stack: err.stack || 'Stack trace unavailable'
    };
  }
}

/**
 * Why this?
 * - By default the error.stack looks like this
 *   "stack": "Error: Something went wrong\n
 *              at Object.<anonymous> (/Users/working_dir/workspace/code_base/starlink-ota/core/logger/test/log-test.js:16:11)\n
 *              at Module._compile (module.js:653:30)\n
 *              at Object.Module._extensions..js (module.js:664:10)\n
 *              at Module.load (module.js:566:32)\n
 *              at tryModuleLoad (module.js:506:12)\n
 *              at Function.Module._load (module.js:498:3)\n
 *              at Function.Module.runMain (module.js:694:10)\n
 *              at startup (bootstrap_node.js:204:16)\n
 *              at bootstrap_node.js:625:3"
 *
 * - By using stack-trace's parse method we can convert it to a more readable form
 *   "stack":[
 *        {"function":null,"file":"/Users/working_dir/workspace/code_base/starlink-ota/core/logger/test/log-test.js","line":16,"column":11},
 *        {"function":"Module._compile","file":"module.js","line":653,"column":30},
 *        {"function":"Module._extensions..js","file":"module.js","line":664,"column":10},
 *        {"function":"Module.load","file":"module.js","line":566,"column":32},
 *        {"function":"tryModuleLoad","file":"module.js","line":506,"column":12},
 *        {"function":"Module._load","file":"module.js","line":498,"column":3},
 *        {"function":"Module.runMain","file":"module.js","line":694,"column":10},
 *        {"function":"startup","file":"bootstrap_node.js","line":204,"column":16},
 *        {"function":null,"file":"bootstrap_node.js","line":625,"column":3}
 *    ]
 *
 * - In log system like ELK, we can do some filtration on above stack array
 * @param error
 * @returns {*}
 */
function parseErrorStack(error) {
  if (!error) {
    return;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    const traces = parse(error);
    return traces.map(function (trace) {
      return {
        function: trace.getFunctionName?.() || 'unknown',
        file: trace.getFileName?.() || 'unknown',
        line: trace.getLineNumber?.() || 0,
        column: trace.getColumnNumber?.() || 0,
      };
    });
  } catch (e) {
    // Fallback if stack-trace parsing fails
    return error.stack || error.message || String(error);
  }
}

function reqSerializer(req, shouldAddReqOptions) {
  if (!req) return;

  if (!shouldAddReqOptions) {
    return;
  }

  const reqObj = {
    method: req.method,
    headers: cleanHeaders(req.headers),
  };

  if (req.connection) {
    reqObj.remoteAddress = req.connection.remoteAddress;
    reqObj.remotePort = req.connection.remotePort;
  }

  return reqObj;
}

function cleanHeaders(headers) {
  return _.omit(headers, ['cookie']);
}

Logger.getLogStreams = getLogStreams;

module.exports = Logger;
