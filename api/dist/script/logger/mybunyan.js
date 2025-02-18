const bunyan = require('bunyan');
let myLogger = null;
const getLogStreams = require('.').getLogStreams;
module.exports = function (name) {
    const func = {};
    if (myLogger === null) {
        myLogger = bunyan.createLogger({
            name: 'starlink-ota',
            serializers: bunyan.stdSerializers,
            streams: getLogStreams(),
        });
    }
    func.info = myLogger.info.bind(myLogger);
    func.error = myLogger.error.bind(myLogger);
    func.fatal = myLogger.fatal.bind(myLogger);
    return func;
};
//# sourceMappingURL=mybunyan.js.map