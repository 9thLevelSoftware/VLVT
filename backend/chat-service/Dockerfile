FROM node:18-alpine

WORKDIR /app

# Copy and build shared package first
COPY shared/package*.json ./shared/
RUN cd shared && npm install

COPY shared/ ./shared/
RUN cd shared && npm run build

# Copy and install chat-service dependencies
COPY chat-service/package*.json ./chat-service/
RUN cd chat-service && npm install

# Copy chat-service source and build
COPY chat-service/ ./chat-service/
RUN cd chat-service && npm run build:docker

WORKDIR /app/chat-service

EXPOSE 3003

CMD ["npm", "start"]
