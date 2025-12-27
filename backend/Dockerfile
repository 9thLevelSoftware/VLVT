# Multi-service Dockerfile for VLVT backend
# Usage: Set SERVICE_NAME build arg to auth-service, profile-service, or chat-service
#
# Example: docker build --build-arg SERVICE_NAME=auth-service .

ARG SERVICE_NAME=auth-service

FROM node:18-alpine

ARG SERVICE_NAME

WORKDIR /app

# ============================================================================
# Step 1: Build the shared package and create a tarball
# ============================================================================
COPY shared/package*.json ./shared/
WORKDIR /app/shared
RUN npm install
COPY shared/ ./
RUN npm run build
# Create a tarball - this avoids symlink issues with file: dependencies
RUN npm pack

# ============================================================================
# Step 2: Build the service using the shared tarball
# ============================================================================
WORKDIR /app/service
COPY ${SERVICE_NAME}/package*.json ./

# Replace the file:../shared reference with the tarball
RUN sed -i 's|"@vlvt/shared": "file:../shared"|"@vlvt/shared": "file:/app/shared/vlvt-shared-1.0.0.tgz"|g' package.json

RUN npm install
COPY ${SERVICE_NAME}/ ./
RUN npm run build

# ============================================================================
# Step 3: Clean up and prepare for production
# ============================================================================
# Remove dev dependencies and unnecessary files
RUN npm prune --production

# Remove the shared source (keep only what's in node_modules)
RUN rm -rf /app/shared

WORKDIR /app/service

EXPOSE 3001 3002 3003

CMD ["npm", "start"]
