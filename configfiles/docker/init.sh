#!/bin/sh

###################################################################################################################
######   This script is expecting 3 environment variables {SETUP_NAME,ZK_URL,ENV},                         ########
######   and as a part of processes it does following steps                                                ########
######   1. It replaces "docker-stack-name" placeholder with SETUP_NAME in zookeeper.json                  ########
######   2. It executes a process of importing zookeeper properties                                        ########
###################################################################################################################

set -x
python=`which python3`


log_directory_escape_char="\/home\/deploy\/code-push-server\/logs"

replace_and_import_zk() {
  local file=$1
  local zk_url=$2
  local replacement_docker_stack=$3
  sed -i "s/docker-stack-name/$replacement_docker_stack/g" $file
  if [ -n "$RUN_NODE_CONTAINER" ] && [ "$RUN_NODE_CONTAINER" = 'true' ]; then
    $python /usr/local/scripts/zk_v3.py --import --overwrite --file "$file" $zk_url
  fi
}

if [ $ENV = 'k8s-stage' ] || [ $ENV = "k8s-pt" ]; then
  echo "environment -> $ENV"

  if [ $ENV = "k8s-pt" ]; then
    # Replace placeholder in zookeeper.json and Start Zookeeper import process
    replace_and_import_zk /home/deploy/docker/zookeeper_pt.json $ZK_URL $SETUP_NAME
  else
    # Used for regression test suite. As many services are still on docker we need to make the K8 ZK point to the docker stack
    if
      [ -n "$RUN_REGRESSION" ] &&
      [ "$RUN_REGRESSION" = 'true' ] &&
      [ -n "$REGRESSION_DOCKER_STACK" ] &&
      [ "$REGRESSION_DOCKER_STACK" != 'NA' ];
    then
      # Replace placeholder in zookeeper.json and Start Zookeeper import process
      replace_and_import_zk /home/deploy/docker/zookeeper.json $ZK_URL $REGRESSION_DOCKER_STACK
    else
      # Replace placeholder in zookeeper.json and Start Zookeeper import process
      replace_and_import_zk /home/deploy/docker/zookeeper_k8s.json $ZK_URL $SETUP_NAME
    fi
  fi
elif [ $ENV = 'k8s-prod' ]; then
  echo "environment -> $ENV"
else
  echo "environment -> $ENV"
  # Replace placeholder in zookeeper.json
  sed -i "s/docker-stack-name/$SETUP_NAME/g" /home/deploy/docker/zookeeper.json
  # Start Zookeeper import process
  $python /usr/local/scripts/zk_v3.py --import --overwrite --file /home/deploy/docker/zookeeper.json $ZK_URL:2181/
fi

status=$?
if [ $status -ne 0 ]; then
    echo "Failed to run python script : $status"
    exit $status
fi