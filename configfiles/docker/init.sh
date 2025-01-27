#!/bin/sh

###################################################################################################################
######   This script is expecting 3 environment variables {SETUP_NAME,ZK_URL,ENV},                         ########
######   and as a part of processes it does following steps                                                ########
######   1. It replaces "docker-stack-name" placeholder with SETUP_NAME in zookeeper.json                  ########
######   2. It executes a process of importing zookeeper properties                                        ########
###################################################################################################################

set -x
python=`which python`

# Reference: Home path of most apps(home_property_path)
# home_property_path is app/resource location
# /var/lib/jetty/
# /usr/local/tomcat/
# /home/tomcat/
# /home/deploy/


if [ $ENV = 'k8s' ]; then
  # Replace placeholder in zookeeper.json
  sed -i "s/docker-stack-name/$SETUP_NAME/g" /home/deploy/docker/zookeeper_k8s.json

  home_property_path="/home/deploy/robin"

  echo "Replacing all docker hardcoded vars with kub vars"
  find $home_property_path -type f -exec sed -i "s/zk\.docker\.dev/zookeeper/g" {} +
  find $home_property_path -type f -exec sed -i "s/mysql\.docker\.dev/mysqlha-0\.mysqlha/g" {} +
  find $home_property_path -type f -exec sed -i "s/kafka\.docker\.dev/kafka/g" {} +
  find $home_property_path -type f -exec sed -i "s/mongo\.docker\.dev/mongodb-ha/g"  {} +
  find $home_property_path -type f -exec sed -i "s/ftp\.docker\.dev/ftp-vsftpd/g"  {} +
  find $home_property_path -type f -exec sed -i "s/smtp\.docker\.dev/smtp/g"  {} +

  # Start Zookeeper import process
  $python /usr/local/scripts/zk.py --import --overwrite --file /home/deploy/docker/zookeeper_k8s.json $ZK_URL:2181/
else
  # Replace placeholder in zookeeper.json
  sed -i "s/docker-stack-name/$SETUP_NAME/g" /home/deploy/docker/zookeeper.json
  
  # Start Zookeeper import process
  $python /usr/local/scripts/zk.py --import --overwrite --file /home/deploy/docker/zookeeper.json $ZK_URL:2181/
fi

status=$?
if [ $status -ne 0 ]; then
    echo "Failed to run python script : $status"
    exit $status
fi