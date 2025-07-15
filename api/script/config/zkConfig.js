const appConfig = require('./appconfig.js');
const ipConfig = require('./ipconfig.js');


const config = {
  //ZK sever config
  /**
   * Put in your config overrides here.
   * Precedence : UUID (heighest precedence) > local > global
   **/
  // Allowed type for global configuration is
  // int, float, string, object
  //Global properties.
  global: [
    {
      path: '/FE/global/redisClusterNodes',
      target: appConfig,
      propertyName: 'redisClusterNodes',
      type: 'object',
    },
    {
      path: `/FE/global/commonRedisClusterNodes`,
      target: appConfig,
      propertyName: 'commonRedisClusterNodes',
      type: 'object',
    },
    {
      path: `/FE/global/abModuleConfig`,
      target: appConfig,
      propertyName: 'abModuleConfig',
      type: 'object',
    },
  ],
  //Local properties.
  basePath: '/FE/starlink-ota', //Base path required for fetching ZK nodes
  local: [
    {
      path: '/appconfig',
      target: appConfig,
    },
    {
      path: '/ipconfig',
      target: ipConfig,
    }
  ],
};
module.exports = config;
