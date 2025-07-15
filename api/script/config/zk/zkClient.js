const zookeeper = require('node-zookeeper-client');
const logger = require('../logger/mybunyan.js')('zookeeper');
const client = {};
let zk = null;
let zkServerPath = '';

client.init = function (connectionString, callback) {
  callback = callback || function () {};
  zkServerPath = connectionString;

  CreateZookeeperClient();
  zk.once('connected', function () {
    logger.info({}, 'ZooKeeper connected to ' + zkServerPath);
    callback();
  });
};

function CreateZookeeperClient() {
  zk = zookeeper.createClient(zkServerPath, {
    retries: 2,
    spinDelay: 2000,
  });
  zk.once('connected', onZKClientConnected);
  zk.once('expired', function () {
    CreateZookeeperClient();
  });
  zk.connect();
}

const arrWatches = []; //{path:"zk node path", updateCallback: callback}
function onZKClientConnected() {
  console.log('--------------Zookeeper Connection Event: connected');
  for (let i = arrWatches.length - 1; i >= 0; i--) {
    client.fetchProperty(
      arrWatches[i].path,
      arrWatches[i].updateCallback,
      arrWatches[i].updateCallback,
    );
  }
}

/**
 * Fetch property of a perticuler node from zookeeper without adding
 * watch
 * @param  {string}   propertyPath [Full path of the node]
 * @param  {Function} callback     [callback with args(err(if any else null), data)]
 */
function fetchProperty_Internal(propertyPath, callback) {
  zk.getData(propertyPath, function (err, data, stat) {
    if (err) {
      logger.error(
        err,
        'Failed to fetch property from zookeeper: ' + propertyPath,
      );
      return callback(err);
    }
    callback(null, data.toString('utf-8'));
  });
}

/**
 * fetch property from zookeeper and add watch on property path for
 * node create/update/delete
 *
 * on success callback will be called with err(null), and data(object),
 * and on modification updateCallback will be called.
 *
 * please keep in mind that updateCallback will be called multiple times, if wather
 * event is sent multiple times from zookeeper.
 *
 * @param  {string}   propertyPath   [full path of zookeeper node]
 * @param  {Function} callback       [callback function with (err(if any else null), data)]
 * @param  {Function}   updateCallback [update function if node created/deleted/changed]
 */
client.fetchProperty = function (propertyPath, callback, updateCallback) {
  updateCallback = updateCallback || function () {};

  let bWatchExist = false;
  for (let i = 0; i < arrWatches.length; i++) {
    if (arrWatches[i].path == propertyPath) {
      bWatchExist = true;
      break;
    }
  }
  if (!bWatchExist) {
    arrWatches[arrWatches.length] = {
      path: propertyPath,
      updateCallback: updateCallback,
    };
  }
  // First check for exist to add all(create/delete/update) watches
  zk.exists(
    propertyPath,
    function (watcherEvent) {
      console.log('=============ZooKeeper watcher event=============');
      console.log(watcherEvent);
      console.log('=================================================');

      // On watch event add watch event again and get data.
      client.fetchProperty(propertyPath, updateCallback, updateCallback);
    },
    function (err, stat) {
      if (err) {
        logger.error(err, 'Failed to fetch property : ' + propertyPath);
        return callback(err);
      } else if (stat) {
        // Node exist fetch data of node
        fetchProperty_Internal(propertyPath, callback);
      } else {
        // Node does not exist
        callback(null, null);
      }
    },
  );
};

client.fetchNode = function (nodePath, callback) {
  zk.getChildren(
    nodePath,
    //Node Update callback
    function (watcherEvent) {
      console.log('Node updated', event);
    },
    function (err, node, stat) {
      const tempNode = {};
      if (err) {
        logger.error(err, 'Failed to fetch node from : ' + nodePath);
        return callback(err);
      }
      for (let i = 0; i < node.length; i++) {
        (function (i) {
          client.fetchProperty(
            nodePath + '/' + node[i],
            function (err, property) {
              if (err) {
                callback(err);
              }
              tempNode[node[i]] = property;
              if (i === node.length - 1) {
                //console.log(tempNode)
                callback(null, tempNode);
              }
            },
          );
        })(i);
      }
    },
  );
};
module.exports = client;
