## Source init.sh
/bin/sh /usr/local/scripts/init.sh /dev/null 2>&1

## -----------------------------------------------------------------
## The RUN_NGINX_CONTAINER and RUN_NODE_CONTAINER flags are used for K8 based setup.
## For K8 there will be 2 containers (NodeJS, Nginx) running inside a single pod.
## Hence we set this flag to run either NodeJS process or Nginx process based on the env variable.
## -----------------------------------------------------------------
if [ -n "$RUN_NGINX_CONTAINER" ] && [ "$RUN_NGINX_CONTAINER" = 'true' ]; then
  echo "Running NGINX_CONTAINER"
  nginx -g "daemon off;"
elif [ -n "$RUN_NODE_CONTAINER" ] && [ "$RUN_NODE_CONTAINER" = 'true' ]; then
  echo "Running NODE_CONTAINER"
   cd /api && npm run  start:env
else
  echo "Running both NGINX_CONTAINER and NODE_CONTAINER"
  cd /api && npm run  start:env& 
  nginx -g "daemon off;"
fi
