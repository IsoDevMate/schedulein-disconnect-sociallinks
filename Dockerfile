# Build stage
FROM ubuntu:22.04 AS builder

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js and build dependencies
RUN apt-get update && \
    apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get update && \
    apt-get install -y \
    nodejs \
    python3 \
    python3-pip \
    build-essential \
    make \
    tar \
    gzip \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Set NODE_OPTIONS for build stage to handle memory allocation
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Clean npm cache and install dependencies with rebuild flag
RUN npm cache clean --force && \
    npm install --force && \
    npm rebuild bcrypt --build-from-source

# Copy source code
COPY . .

# Ensure templates directory exists (create if it doesn't)
RUN mkdir -p ./templates

# Build the application with memory allocation
RUN npm run build

# Debug: Show the contents of the src directory
RUN ls -la ./src

# Debug: Show the contents of the dist directory
RUN ls -la ./dist

# Debug: Check if main.js exists in dist/src
RUN ls -la ./dist/src/main.js || echo "main.js not found in dist/src"

# Move the compiled files to the correct location
RUN mv ./dist/src/* ./dist/ && rm -rf ./dist/src

# Verify the build output exists
RUN ls -la ./dist && ls -la ./dist/main.js

# Production stage
FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js, runtime dependencies and FFmpeg
RUN apt-get update && \
    apt-get install -y \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get update && \
    apt-get install -y \
    nodejs \
    ffmpeg \
    wget \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Set NODE_OPTIONS for production stage
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Copy built node_modules from builder (includes compiled bcrypt)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy templates directory (will exist from builder stage)
COPY --from=builder /app/templates ./templates

# Copy public directory for static and verification files
COPY public ./public

# Verify the dist directory structure
RUN ls -la ./dist && [ -f ./dist/main.js ]

# Add non-root user for security
RUN groupadd -r nestjs && useradd -r -g nestjs nestjs && \
    chown -R nestjs:nestjs /app

USER nestjs

# Set environment variables with proper memory allocation
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--max-old-space-size=4096"

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Expose port
EXPOSE 3000

# Start the application using the docker-specific script
CMD ["npm", "run", "start:docker"]








# #  Build stage
# FROM node:16-alpine AS builder

# WORKDIR /app

# # Copy package files
# COPY package*.json ./

# # Install dependencies
# RUN npm install --force

# # Copy source code
# COPY . .

# # Build the application
# RUN npm run build

# # Move files if needed
# RUN if [ -d ./dist/src ]; then mv ./dist/src/* ./dist/ && rm -rf ./dist/src; fi

# # Production stage
# FROM node:16-alpine

# WORKDIR /app

# COPY package*.json ./

# # Use --force or --legacy-peer-deps if necessary
# RUN npm install --only=production --force


# # Copy built files from builder stage
# COPY --from=builder /app/dist ./dist

# # Expose port
# EXPOSE 3000

# # Start the application
# CMD ["npm", "run", "start:prod"]


# # Build stage
# FROM node:18-alpine AS base

# # Install system dependencies for building native modules
# RUN apk add --no-cache \
#     python3 \
#     make \
#     g++ \
#     libc6-compat \
#     ffmpeg

# WORKDIR /app

# # Copy package files first to leverage Docker cache
# COPY package*.json ./

# # Install dependencies with cache optimization
# RUN npm ci --only=production --ignore-scripts --force && \
#     npm cache clean --force

# # Development dependencies stage
# FROM base AS dev-deps
# RUN npm ci --include=dev --ignore-scripts --force

# # Build stage
# FROM dev-deps AS builder

# # Copy source code
# COPY . .

# # Set NODE_OPTIONS for build stage
# ENV NODE_OPTIONS="--max-old-space-size=4096"

# # Build the application
# RUN npm run build

# # Production stage
# FROM node:18-alpine AS production

# # Install runtime dependencies
# RUN apk add --no-cache \
#     dumb-init \
#     ffmpeg \
#     wget

# WORKDIR /app

# # Create non-root user
# RUN addgroup -g 1001 -S nestjs && \
#     adduser -S nestjs -u 1001

# # Copy package files
# COPY package*.json ./

# # Copy production node_modules from base stage
# COPY --from=base /app/node_modules ./node_modules

# # Copy built application
# COPY --from=builder /app/dist ./dist

# # Copy necessary runtime files
# COPY --from=builder /app/templates ./templates
# COPY --from=builder /app/public ./public

# # Change ownership
# RUN chown -R nestjs:nestjs /app

# USER nestjs

# # Set environment variables
# ENV NODE_ENV=production \
#     PORT=3000 \
#     NODE_OPTIONS="--max-old-space-size=4096"

# # Healthcheck
# HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
#     CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# EXPOSE 3000

# # Use dumb-init for proper signal handling
# ENTRYPOINT ["dumb-init", "--"]
# CMD ["node", "dist/main.js"]
