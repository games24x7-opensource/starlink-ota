FROM 272110293415.dkr.ecr.ap-south-1.amazonaws.com/games24x7/nginx-node-v20.12.0-multiarch:v1.0.1-multiarch

ARG ZK_URL=zk1-stagepf.rummycircle.com:2181,zk2-stagepf.rummycircle.com:2181,zk3-stagepf.rummycircle.com:2181
ARG APP_PORT=8080
ARG ZK_ROOT=FE
ENV APP_PORT=${APP_PORT}
ENV ZK_ROOT=${ZK_ROOT}
ENV ZK_URL=${ZK_URL}

COPY configfiles/docker/zookeeper.json /home/deploy/docker/zookeeper.json
COPY configfiles/docker/zookeeper_k8s.json /home/deploy/docker/zookeeper_k8s.json
COPY configfiles/docker/init.sh /usr/local/scripts/init.sh
COPY configfiles/docker/startup.sh /home/deploy/docker/startup.sh

WORKDIR /app
COPY . /app

RUN addgroup --system tomcat && adduser --system tomcat && adduser tomcat tomcat && \
  chown -R tomcat.tomcat /home/deploy/* && \
  chown -R tomcat.tomcat /app/* && \
  chmod -R 755 /home/deploy/* && \
  chmod -R 755 /app/* && \
  chmod +x /usr/local/scripts/init.sh && \
  chmod +x /home/deploy/docker/startup.sh && \
  # Install API dependencies
  cd /app/api && \
  rm -rf node_modules && \
  npm install --no-package-lock && \
  # Install CLI dependencies
  cd /app/cli && \
  rm -rf node_modules && \
  npm install --no-package-lock && \
  # Return to app directory and build
  cd /app && \
  npm run build

EXPOSE ${APP_PORT}
USER tomcat

ENTRYPOINT ["/bin/sh","/home/deploy/docker/startup.sh"]