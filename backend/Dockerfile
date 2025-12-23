FROM node:18-alpine

ARG SERVICE_NAME
ARG SERVICE_PORT

WORKDIR /app

# Copy and build shared package first
COPY shared/package*.json ./shared/
RUN cd shared && npm install

COPY shared/ ./shared/
RUN cd shared && npm run build

# Copy and install service dependencies
COPY ${SERVICE_NAME}/package*.json ./${SERVICE_NAME}/
RUN cd ${SERVICE_NAME} && npm install

# Copy service source and build
COPY ${SERVICE_NAME}/ ./${SERVICE_NAME}/
RUN cd ${SERVICE_NAME} && npm run build:docker

WORKDIR /app/${SERVICE_NAME}

EXPOSE ${SERVICE_PORT}

CMD ["npm", "start"]
