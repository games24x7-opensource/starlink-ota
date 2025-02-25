const events = require('events');
const Logger = require('../logger');
const appConfig = {};

appConfig.emitter = new events.EventEmitter();
appConfig.updateCallback = function (strPropertyName) {
  Logger.info('+++++++++++++++appConfig updateCallback++++++++++++++++++++');
  Logger.info(strPropertyName);
  Logger.info(appConfig[strPropertyName]);
  Logger.info('+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
  appConfig.emitter.emit('appConfigChanged');
};

module.exports = appConfig;
