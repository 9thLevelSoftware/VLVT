# Multi-service Dockerfile for VLVT backend
# Usage: Set SERVICE_NAME build arg to auth-service, profile-service, or chat-service
#
# Example: docker build --build-arg SERVICE_NAME=auth-service .

ARG SERVICE_NAME=auth-service

# Build stage
FROM node:18-alpine AS builder

ARG SERVICE_NAME

WORKDIR /app

# Copy and build shared package first
COPY shared/package*.json ./shared/
WORKDIR /app/shared
RUN npm install
COPY shared/ ./
RUN npm run build

# Copy and build the target service
WORKDIR /app/service
COPY ${SERVICE_NAME}/package*.json ./

# Update package.json to use absolute path for shared package
RUN sed -i 's|"@vlvt/shared": "file:../shared"|"@vlvt/shared": "file:/app/shared"|g' package.json

RUN npm install
COPY ${SERVICE_NAME}/ ./
RUN npm run build

# Production stage
FROM node:18-alpine

ARG SERVICE_NAME

WORKDIR /app

# Copy shared package (needed at runtime for node_modules resolution)
COPY --from=builder /app/shared/dist ./node_modules/@vlvt/shared/dist
COPY --from=builder /app/shared/package.json ./node_modules/@vlvt/shared/

# Copy service
COPY --from=builder /app/service/dist ./dist
COPY --from=builder /app/service/package*.json ./
COPY --from=builder /app/service/node_modules ./node_modules

# Expose port based on service (default 3001 for auth)
EXPOSE 3001 3002 3003

CMD ["npm", "start"]
