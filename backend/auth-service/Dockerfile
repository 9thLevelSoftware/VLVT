FROM node:18-alpine

WORKDIR /app

# Copy and build shared package first
COPY shared/package*.json ./shared/
RUN cd shared && npm install

COPY shared/ ./shared/
RUN cd shared && npm run build

# Copy and install auth-service dependencies
COPY auth-service/package*.json ./auth-service/
RUN cd auth-service && npm install

# Copy auth-service source and build
COPY auth-service/ ./auth-service/
RUN cd auth-service && npm run build:docker

WORKDIR /app/auth-service

EXPOSE 3001

CMD ["npm", "start"]
