FROM 272110293415.dkr.ecr.ap-south-1.amazonaws.com/games24x7/nginx-node-v20.12.0-multiarch:v1.0.1-multiarch
RUN echo -n "System Architechture: " && arch

ARG ZK_URL
ARG APP_PORT=8080
ARG ZK_ROOT=FE
ARG log_directory=/home/deploy/code-push-server/logs
ARG app_directory=/home/deploy/code-push-server
ARG NODE_ENV
ARG node_server_port=8080

ENV NODE_ENV=${NODE_ENV}
ENV APP_PORT=${APP_PORT}
ENV ZK_ROOT=${ZK_ROOT}
ENV ZK_URL=${ZK_URL}
ENV log_directory=/home/deploy/code-push-server/logs
ENV app_directory=/home/deploy/code-push-server
ENV node_server_port=8080

# Create necessary directories first
RUN mkdir -p ${app_directory}/api

COPY api/package.json ${app_directory}/api
COPY .npmrc ${app_directory}/

# move api and cli folders to docker machine
COPY api/dist ${app_directory}/api/dist
COPY api/node_modules ${app_directory}/api/node_modules

#zk segregation pre requisites
COPY configfiles/docker/zookeeper.json /home/deploy/docker/zookeeper.json
COPY configfiles/docker/zookeeper_k8s.json /home/deploy/docker/zookeeper_k8s.json
COPY configfiles/docker/init.sh /usr/local/scripts/init.sh
COPY configfiles/docker/startup.sh /home/deploy/docker/startup.sh

RUN apt-get update && \
  apt-get install -y build-essential && \
  apt-get install -y j2cli=0.3.12b-4 && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

RUN apt-get update && \
  apt-get install -y binutils && \
  strip /usr/local/bin/node && \
  apt-get remove --purge -y binutils && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR ${app_directory}/

RUN mkdir logs

RUN ls -al ${app_directory}/

RUN addgroup --system tomcat && adduser --system tomcat && adduser tomcat tomcat && \
  chown -R tomcat.tomcat /home/deploy/* && \
  chmod -R 755 /home/deploy/* && \
  chmod +x /usr/local/scripts/init.sh && \
  chmod +x /home/deploy/docker/startup.sh

#---------------------------------------------------------------------------
# Print the versions of all the necessary packages after docker build
#---------------------------------------------------------------------------
ENV NODE_ENV development

RUN echo -n "NPM Path: " && which npm && echo -n "NPM Version: " && npm --version
RUN echo -n "NodeJS Path: " && which node && echo -n "NodeJS Version: " && node --version
RUN echo -n "Python Path: " && which python3 && echo -n "Python Version: " && python3 --version
#---------------------------------------------------------------------------

ENTRYPOINT ["/bin/sh","/home/deploy/docker/startup.sh"]
