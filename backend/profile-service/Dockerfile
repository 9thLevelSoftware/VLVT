# Build stage - uses backend as context (set dockerfilePath in railway.json)
FROM node:18-alpine AS builder

WORKDIR /app

# Copy shared package first
COPY shared/package*.json ./shared/
WORKDIR /app/shared
RUN npm install
COPY shared/ ./
RUN npm run build
# Create tarball to avoid symlink issues with file: dependencies
RUN npm pack

# Copy service package
WORKDIR /app/profile-service
COPY profile-service/package*.json ./

# Install from tarball instead of file: reference
RUN sed -i 's|"@vlvt/shared": "file:../shared"|"@vlvt/shared": "file:/app/shared/vlvt-shared-1.0.0.tgz"|g' package.json

RUN npm install

COPY profile-service/ ./
RUN npm run build

# Clean up for production
RUN npm prune --production

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy service with all dependencies baked in
COPY --from=builder /app/profile-service/dist ./dist
COPY --from=builder /app/profile-service/package*.json ./
COPY --from=builder /app/profile-service/node_modules ./node_modules

EXPOSE 3002

CMD ["npm", "start"]
