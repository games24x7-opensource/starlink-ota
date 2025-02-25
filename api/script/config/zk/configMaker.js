const async = require('async');
const _ = require('lodash');

const getmac = require('./getmac.js');
const logger = require('../logger/mybunyan.js')('zookeeper');
const zkClient = require('./zkClient');
const zkConfig = require('../config/zkConfig');

let zkConnectionString;
logger('configmake!!!!!!!!!!!!' + process.env.ZK_URL);
try {
  logger(process.env.ZK_URL);
  zkConnectionString = process.env.ZK_URL;
} catch (e) {}

const maker = {
  init: function (appCallback) {
    const self = this;
    logger(zkConnectionString);
    zkClient.init(zkConnectionString, function () {
      async.series(
        [
          self._fetchGlobalProps.bind(self),
          self._fetchLocalProps.bind(self),
          self._fetchUUIDProps.bind(self),
        ],
        function () {
          logger.info({}, 'Everything has been fetched ......');
          appCallback();
        },
      );
    });
  },
  _fetchGlobalProps: function (asyncCallback) {
    const self = this;
    const tasks = [];
    let value;
    if (zkConfig.global.length > 0) {
      zkConfig.global.forEach(function (config, i) {
        config.cache = {};

        const iterateeFunc = function (data, updateCallback) {
          if (data) {
            value = GetValueFromString(config.type, data);
            if (value) {
              config.cache[config.propertyName] = value;
            }
          } else {
            delete config.cache[config.propertyName];
          }
          self.resolve(config.target, config.propertyName, updateCallback);
        };

        const taskFunc = function (tasksCallback) {
          zkClient.fetchProperty(
            config.path,
            function (err, data) {
              if (err) {
                logger.error(err, 'Config Maker Error.');
              } else {
                iterateeFunc(data);
              }
              tasksCallback(null);
            },

            function (err, data) {
              if (err) {
                logger.error(err, 'Config Maker UpdateCallback Error.');
              } else {
                iterateeFunc(data, config.target.updateCallback);
              }
            },
          );
        };
        tasks.push(taskFunc);
      });

      async.series(tasks, function () {
        logger.info({}, 'All global properties fetched.');
        asyncCallback(null);
      });
    } else {
      asyncCallback(null);
    }
  },
  _fetchLocalProps: function (asyncCallback) {
    const tasks = [];
    const self = this;
    let value;
    if (zkConfig.local.length > 0) {
      zkConfig.local.forEach(function (config, i) {
        config.cache = {};

        const iterateeFunc = function (data, updateCallback) {
          const arrKeys = Object.keys(config.cache);
          if (data) {
            value = GetValueFromString('object', data);
            if (value) {
              for (const key in value) {
                let bPresent = false;
                for (var j = 0; j < arrKeys.length; j++) {
                  if (arrKeys[j] == key) {
                    bPresent = true;
                    break;
                  }
                }
                if (!bPresent) arrKeys[arrKeys.length] = key;
              }
              config.cache = value;
            }
          } else {
            config.cache = {};
          }
          for (var j = 0; j < arrKeys.length; j++) {
            self.resolve(config.target, arrKeys[j], updateCallback);
          }
        };
        const taskFunc = function (tasksCallback) {
          zkClient.fetchProperty(
            zkConfig.basePath + config.path,
            function (err, data) {
              if (err) {
                logger.error(err, 'Config Maker Error.');
              } else {
                iterateeFunc(data);
              }
              tasksCallback(null);
            },
            function (err, data) {
              if (err) {
                logger.error(err, 'Config Maker UpdateCallback Error.');
              } else {
                iterateeFunc(data, config.target.updateCallback);
              }
            },
          );
        };

        tasks.push(taskFunc);
      });

      async.series(tasks, function () {
        logger.info({}, 'All Local properties fetched');
        asyncCallback(null);
      });
    }
  },
  _fetchUUIDProps: function (asyncCallback) {
    const tasks = [];
    const self = this;
    const UUID_path = zkConfig.basePath + '/' + self.getUUID();
    if (zkConfig.local.length > 0) {
      zkConfig.local.forEach(function (config, i) {
        config.cache_uuid = {};

        const iterateeFunc = function (data, updateCallback) {
          const arrKeys = Object.keys(config.cache_uuid);
          if (data) {
            value = GetValueFromString('object', data);
            if (value) {
              for (key in value) {
                let bPresent = false;
                for (var j = 0; j < arrKeys.length; j++) {
                  if (arrKeys[j] == key) {
                    bPresent = true;
                    break;
                  }
                }
                if (!bPresent) arrKeys[arrKeys.length] = key;
              }
              config.cache_uuid = value;
            }
          } else {
            config.cache_uuid = {};
          }
          for (var j = 0; j < arrKeys.length; j++) {
            self.resolve(config.target, arrKeys[j], updateCallback);
          }
        };
        const taskFunc = function (tasksCallback) {
          zkClient.fetchProperty(
            UUID_path + config.path,
            function (err, data) {
              if (err) {
                logger.error(err, 'Config Maker Error.');
              } else {
                iterateeFunc(data);
              }
              tasksCallback(null);
            },
            function (err, data) {
              if (err) {
                logger.error(err, 'Config Maker UpdateCallback Error.');
              } else {
                iterateeFunc(data, config.target.updateCallback);
              }
            },
          );
        };

        tasks.push(taskFunc);
      });

      async.series(tasks, function () {
        logger.info({}, 'All UUID properties fetched');
        asyncCallback(null);
      });
    }
  },
  resolve: function (target, propertyName, updateCallbackCallback) {
    const oldPropertyValue = target[propertyName];

    updateCallbackCallback = updateCallbackCallback || function () {};
    if (zkConfig.global.length > 0) {
      zkConfig.global.forEach(function (config) {
        if (
          config.target == target &&
          config.cache &&
          config.cache.hasOwnProperty(propertyName)
        ) {
          target[propertyName] = config.cache[propertyName];
        }
      });
    }

    if (zkConfig.local.length > 0) {
      zkConfig.local.forEach(function (config) {
        if (
          config.target == target &&
          config.cache &&
          config.cache.hasOwnProperty(propertyName)
        ) {
          target[propertyName] = config.cache[propertyName];
        }
      });
    }

    if (zkConfig.local.length > 0) {
      zkConfig.local.forEach(function (config) {
        if (
          config.target == target &&
          config.cache_uuid &&
          config.cache_uuid.hasOwnProperty(propertyName)
        ) {
          target[propertyName] = config.cache_uuid[propertyName];
        }
      });
    }

    if (!_.isEqual(oldPropertyValue, target[propertyName])) {
      updateCallbackCallback(propertyName);
    }
  },
  getUUID: function () {
    return getmac.GetMacAddress();
  },
};

function GetValueFromString(type, data) {
  let value = null;
  if (data) {
    try {
      if (type == 'int') {
        value = parseInt(data);
        if (isNaN(data)) {
          value = null;
        }
      } else if (type == 'float') {
        value = parseFloat(data);
        if (isNaN(data)) {
          value = null;
        }
      } else if (type == 'string') {
        value = data;
      } else if (type == 'object') {
        value = JSON.parse(data);
      }
    } catch (ex) {
      logger.error(ex, 'Failed to parse property from zookeeper: ' + data);
    }
  }
  return value;
}

module.exports = maker;
