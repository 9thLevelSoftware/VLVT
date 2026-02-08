# Profile-service Dockerfile
# Build context: backend/

FROM node:18-alpine

WORKDIR /app

# Build shared package and create tarball
COPY shared/package*.json ./shared/
WORKDIR /app/shared
RUN npm install
COPY shared/ ./
RUN npm run build
RUN npm pack

# Build profile-service using the tarball
WORKDIR /app/service
COPY profile-service/package*.json ./
RUN sed -i 's|"@vlvt/shared": "file:../shared"|"@vlvt/shared": "file:/app/shared/vlvt-shared-1.0.0.tgz"|g' package.json
RUN npm install
COPY profile-service/ ./
RUN npm run build

# Clean up for production
RUN npm prune --production
RUN rm -rf /app/shared

WORKDIR /app/service
EXPOSE 3002
CMD ["npm", "start"]
