FROM node:18-alpine

WORKDIR /app

# Copy and build shared package first
COPY shared/package*.json ./shared/
RUN cd shared && npm install

COPY shared/ ./shared/
RUN cd shared && npm run build

# Copy and install profile-service dependencies
COPY profile-service/package*.json ./profile-service/
RUN cd profile-service && npm install

# Copy profile-service source and build
COPY profile-service/ ./profile-service/
RUN cd profile-service && npm run build:docker

WORKDIR /app/profile-service

EXPOSE 3002

CMD ["npm", "start"]
