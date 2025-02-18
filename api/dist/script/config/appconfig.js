const events = require('events');
const appConfig = {};
appConfig.emitter = new events.EventEmitter();
appConfig.updateCallback = function (strPropertyName) {
    console.log('+++++++++++++++appConfig updateCallback++++++++++++++++++++');
    console.log(strPropertyName);
    console.log(appConfig[strPropertyName]);
    console.log('+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
    appConfig.emitter.emit('appConfigChanged');
};
module.exports = appConfig;
//# sourceMappingURL=appconfig.js.map