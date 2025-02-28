const events = require('events');
const Logger = require('../logger');
const appConfig = {};

appConfig.emitter = new events.EventEmitter();
appConfig.updateCallback = function (strPropertyName) {
  Logger.info('+++++++++++++++appConfig updateCallback++++++++++++++++++++').log();
  Logger.info(strPropertyName).log();
  Logger.info(appConfig[strPropertyName]).log();
  Logger.info('+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++').log();
  appConfig.emitter.emit('appConfigChanged');
};

module.exports = appConfig;
