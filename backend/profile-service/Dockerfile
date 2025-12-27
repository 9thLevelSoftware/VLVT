# Build stage - uses backend as context (set dockerfilePath in railway.json)
FROM node:18-alpine AS builder

WORKDIR /app

# Copy shared package first
COPY shared/package*.json ./shared/
WORKDIR /app/shared
RUN npm install
COPY shared/ ./
RUN npm run build

# Copy service package
WORKDIR /app/profile-service
COPY profile-service/package*.json ./

# Update package.json to use local shared package path
RUN sed -i 's|"@vlvt/shared": "file:../shared"|"@vlvt/shared": "file:/app/shared"|g' package.json

RUN npm install

COPY profile-service/ ./
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy shared package dist
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/package.json ./shared/

# Copy service
COPY --from=builder /app/profile-service/dist ./dist
COPY --from=builder /app/profile-service/package*.json ./
COPY --from=builder /app/profile-service/node_modules ./node_modules

EXPOSE 3002

CMD ["npm", "start"]
